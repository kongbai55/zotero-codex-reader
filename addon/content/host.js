/* Mozilla host adapter. Connects only to a local executable through stdio. */
var CodexReaderHost = {
  process:null, rpc:null, starting:null, sessions:new Map(), listeners:new Set(), deleting:new Set(),
  status:'尚未连接', models:[], accountReady:false, rootURI:'', generation:0,
  timer:{set:(fn,ms)=>setTimeout(fn,ms), clear:id=>clearTimeout(id)},
  emit() { for (const listener of this.listeners) { try { listener(); } catch (_) {} } },
  async findBinary() {
    const {Subprocess} = ChromeUtils.importESModule('resource://gre/modules/Subprocess.sys.mjs');
    const env = Subprocess.getEnvironment();
    const configured = Services.prefs.getStringPref('extensions.codexreader.binary','').trim();
    const candidates = [];
    if (configured) candidates.push(configured);
    if (Zotero.isWin) {
      if (env.APPDATA) candidates.push(PathUtils.join(env.APPDATA,'npm','codex.cmd'));
      if (env.LOCALAPPDATA) candidates.push(PathUtils.join(env.LOCALAPPDATA,'Microsoft','WinGet','Links','codex.exe'));
    }
    try { candidates.push(await Subprocess.pathSearch(Zotero.isWin ? 'codex.exe' : 'codex')); } catch (_) {}
    try { candidates.push(await Subprocess.pathSearch(Zotero.isWin ? 'codex.cmd' : 'codex')); } catch (_) {}
    for (const path of candidates) {
      if (!path || !PathUtils.isAbsolute(path)) continue;
      if (/\.(cmd|ps1|bat)$/i.test(path)) {
        // Resolve npm's native executable without invoking a shell or reading the shim.
        const prefix = PathUtils.parent(path);
        for (const arch of ['x64','arm64']) {
          for (const tail of [['bin','codex.exe'],['codex','codex.exe']]) {
            const target = PathUtils.join(prefix,'node_modules','@openai','codex','node_modules','@openai',
              `codex-win32-${arch}`,'vendor',arch === 'x64' ? 'x86_64-pc-windows-msvc' : 'aarch64-pc-windows-msvc',...tail);
            if (await IOUtils.exists(target)) return target;
          }
        }
      } else if (await IOUtils.exists(path)) return path;
    }
    throw new Error('未找到 Codex 可执行文件。请在设置中选择 codex.exe 或 npm 安装的 codex.cmd。');
  },
  async connect() {
    if (this.rpc && !this.rpc.closed) return this.rpc;
    if (this.starting) return this.starting;
    this.starting = this._connect();
    try { return await this.starting; } finally { this.starting = null; }
  },
  async _connect() {
    const generation = ++this.generation;
    this.status = '正在连接本机 Codex…'; this.emit();
    try {
      const {Subprocess} = ChromeUtils.importESModule('resource://gre/modules/Subprocess.sys.mjs');
      const binary = await this.findBinary();
      this.cwd = PathUtils.join(Zotero.Profile.dir,'codex-reader-workspace');
      await IOUtils.makeDirectory(this.cwd,{ignoreExisting:true});
      // No CODEX_HOME/env/config override: Codex resolves the user's existing configuration and login.
      const process = await Subprocess.call({command:binary,arguments:CodexReaderCore.launchArgs(),workdir:this.cwd,stderr:'pipe'});
      if (generation !== this.generation) { process.kill(); throw new Error('连接已取消。'); }
      this.process = process;
      const rpc = new CodexReaderCore.Rpc({
        write:line=>process.stdin.write(line), timer:this.timer,
        onNotification:(method,params)=>{
          if(method==='thread/deleted') {
            for(const [key,session] of this.sessions)if(session.threadId===params.threadId)this.sessions.delete(key);
            this.emit();
          }
          for (const session of this.sessions.values()) session.event(method,params);
          if (method === 'account/login/completed') {
            this.status = params.success ? '登录成功，请重新连接以刷新模型。' : '登录未完成。'; this.emit();
          }
        },
        onRequest:(method,params)=>this.handleRequest(method,params),
        onClose:()=>{
          if (this.rpc !== rpc) return;
          try {process.kill();} catch (_) {}
          this.status = 'Codex 已断开，请重新连接。'; this.accountReady = false;
          for (const session of this.sessions.values()) session.finish('failed','Codex 连接中断；可重连后新建会话。');
          this.emit();
        }
      });
      this.rpc = rpc;
      this.readLoop(process.stdout,chunk=>rpc.feed(chunk),rpc).catch(()=>{});
      // Drain, discard, and never persist stderr: it can include sensitive diagnostic content.
      this.readLoop(process.stderr,()=>{},null).catch(()=>{});
      process.wait().then(()=>rpc.close(),()=>rpc.close());
      const init = await rpc.request('initialize',{clientInfo:{name:'zotero_codex_reader',title:'Codex Reader for Zotero',version:'0.4.0'},capabilities:{experimentalApi:true}});
      await rpc.notify('initialized');
      this.version = init.userAgent || 'Codex';
      const account = await rpc.request('account/read',{refreshToken:false});
      this.accountReady = !!account.account || account.requiresOpenaiAuth === false;
      this.models = [];
      if (this.accountReady) {
        try { const result = await rpc.request('model/list',{}); this.models = result.data || []; } catch (_) {}
      }
      this.status = this.accountReady ? '已连接 · 使用现有 Codex 配置' : 'Codex 尚未登录，点击“官方登录”。';
      this.emit(); return rpc;
    } catch (error) {
      if (this.process) { try { this.process.kill(); } catch (_) {} }
      this.rpc?.close(error); this.rpc = null; this.process = null;
      this.status = error.message; this.emit(); throw error;
    }
  },
  async readLoop(pipe,onChunk,rpc) {
    try {
      while (true) { const chunk = await pipe.readString(); if (!chunk) break; onChunk(chunk); }
      rpc?.close();
    } catch (_) { rpc?.close(); }
  },
  async login() {
    const rpc = await this.connect();
    const result = await rpc.request('account/login/start',{type:'chatgpt'});
    if (!result.authUrl) throw new Error('Codex 未提供登录链接，请先在终端运行 codex login。');
    // Only an explicit login action can open an OAuth URL, never model text.
    const url = new URL(result.authUrl);
    if (url.protocol !== 'https:' || !['auth.openai.com','auth0.openai.com','chatgpt.com'].includes(url.hostname)) {
      throw new Error('登录地址不在官方域名中，请在终端使用 codex login。');
    }
    Zotero.launchURL(url.href); this.status = '请在浏览器完成官方登录，然后点击重新连接。'; this.emit();
  },
  getSession(key) {
    let session = this.sessions.get(key);
    if (!session || session.rpc !== this.rpc) {
      session = new CodexReaderCore.Session(this.rpc,CodexReaderProjects.current(key)?.path || this.cwd,()=>this.emit());
      this.sessions.set(key,session);
    }
    return session;
  },
  async clearSession(key) {
    const session = this.sessions.get(key);
    if (session?.busy) throw new Error('请先停止当前回答，再新建会话。');
    if (session?.threadId && this.rpc && !this.rpc.closed) {
      try { await this.rpc.request('thread/unload',{threadId:session.threadId},10000); } catch (_) {}
    }
    this.sessions.delete(key); this.emit();
  },
  async listHistory() {
    const rpc = await this.connect();
    const result = await rpc.request('thread/list',{limit:40,sortKey:'updated_at'});
    return result.data || [];
  },
  async forkHistory(key,threadId) {
    if(this.deleting.has(threadId))throw new Error('该会话正在删除。');
    if (this.sessions.get(key)?.busy) throw new Error('请先停止当前回答。');
    const rpc = await this.connect();
    const cwd=CodexReaderProjects.current(key)?.path || this.cwd;
    const result = await rpc.request('thread/fork',{threadId,ephemeral:false,excludeTurns:false,cwd,approvalPolicy:'on-request',sandbox:'read-only',developerInstructions:CodexReaderCore.INSTRUCTIONS});
    const session = new CodexReaderCore.Session(rpc,cwd,()=>this.emit());
    session.threadId = result.thread.id;
    // Include only plain user/assistant text in the UI; never render tool output or HTML.
    for (const turn of (result.thread.turns || [])) for (const item of (turn.items || [])) {
      if (item.type === 'agentMessage') session.messages.push({role:'assistant',text:item.text || '',status:'completed'});
      if (item.type === 'userMessage') session.messages.push({role:'user',text:(item.content || []).filter(x=>x.type==='text').map(x=>x.text).join('\n'),context:''});
    }
    this.sessions.set(key,session); this.emit(); return session;
  },
  async deleteHistory(threadId) {
    if(this.deleting.has(threadId))throw new Error('该会话正在删除。');
    if([...this.sessions.values()].some(s=>s.threadId===threadId && s.busy))throw new Error('请先停止该会话的回答，再删除。');
    this.deleting.add(threadId);
    try {
      const rpc=await this.connect();
      // Release this client's writer before requesting a permanent local delete.
      if([...this.sessions.values()].some(s=>s.threadId===threadId))await rpc.request('thread/unload',{threadId},10000);
      await rpc.request('thread/delete',{threadId});
      for(const [key,session] of this.sessions)if(session.threadId===threadId)this.sessions.delete(key);
      this.emit();
    } finally {this.deleting.delete(threadId);}
  },
  async handleRequest(method,params) {
    const win = Zotero.getMainWindow();
    const confirm = (title,details)=>Services.prompt.confirm(win,title,details);
    if (['item/commandExecution/requestApproval','item/fileChange/requestApproval','execCommandApproval','applyPatchApproval'].includes(method)) {
      const description = [params.command,params.cwd && '工作目录：'+params.cwd,params.reason,params.grantRoot && '申请写入目录：'+params.grantRoot].filter(Boolean).map(String).join('\n').slice(0,5000) || 'Codex 请求执行操作；未提供具体命令或文件内容。';
      const accepted = confirm('Codex 请求一次性授权',description+'\n\n当前论文可能含不可信文字。仅当这符合你提出的问题时允许。');
      const legacy = ['execCommandApproval','applyPatchApproval'].includes(method);
      return {decision:accepted ? (legacy ? 'approved' : 'accept') : (legacy ? 'denied' : 'decline')};
    }
    if (method === 'mcpServer/elicitation/request') {
      if (params.mode === 'url' && params.url) {
        const url = new URL(params.url);
        if (url.protocol !== 'https:') return {action:'decline'};
        if (confirm('配置的服务请求打开页面',`${params.message || ''}\n\n${url.href}\n\n是否在浏览器中打开？`)) {
          Zotero.launchURL(url.href); return {action:'accept'};
        }
        return {action:'decline'};
      }
      const schema = params.requestedSchema;
      const content = {};
      if (!schema?.properties || Object.keys(schema.properties).length > 12) return {action:'decline'};
      for (const [name,field] of Object.entries(schema.properties)) {
        if (/password|secret|token|api.?key|credential/i.test(name)) return {action:'decline'};
        const value = {value:''};
        if (!Services.prompt.prompt(win,'Codex 服务需要信息',`${params.message || ''}\n${field.title || name}${field.enum ? '\n可选：'+field.enum.join(' / ') : ''}`,value,null,{})) return {action:'decline'};
        if (field.type === 'boolean') content[name] = /^(true|yes|是)$/i.test(value.value);
        else if (field.type === 'number' || field.type === 'integer') { content[name]=Number(value.value); if (!Number.isFinite(content[name])) return {action:'decline'}; }
        else content[name] = value.value;
        if (field.enum && !field.enum.includes(content[name])) return {action:'decline'};
      }
      return {action:'accept',content};
    }
    if (method === 'item/tool/requestUserInput') {
      const answers = {};
      for (const question of (params.questions || [])) {
        const value = {value:question.options?.[0]?.label || ''};
        if (!Services.prompt.prompt(win,question.header || 'Codex 提问',question.question+'\n'+(question.options || []).map(x=>x.label+': '+x.description).join('\n'),value,null,{})) return {answers:{}};
        answers[question.id] = {answers:[value.value]};
      }
      return {answers};
    }
    // Credential/token/attestation requests are intentionally unsupported; Codex owns login.
    return null;
  },
  async disconnect() {
    this.generation++;
    this.rpc?.close();
    if (this.process) { try { this.process.kill(); } catch (_) {} }
    this.process = null; this.rpc = null; this.starting = null; this.accountReady = false;
    this.sessions.clear(); this.status = '尚未连接'; this.emit();
  }
};
