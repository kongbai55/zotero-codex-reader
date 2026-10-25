/* User-selected attachments only. Copies live in the plugin workspace, never in the library. */
var CodexReaderAttachments = {
  MAX_FILES:10, MAX_FILE:20*1024*1024, MAX_TOTAL:50*1024*1024, MAX_TEXT:60000, MAX_PATH:240,
  textExtensions:new Set('txt md markdown csv tsv json jsonl yaml yml xml html htm css js jsx ts tsx py r jl c cpp h hpp java rs go sh ps1 tex bib ris log ini toml sql svg'.split(' ')),
  safeName(name) {
    const clean=String(name || 'attachment').split(/[\\/]/).pop().replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/[. ]+$/,'') || 'attachment';
    return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(clean)?'_'+clean:clean;
  },
  imageType(bytes) {
    if(bytes[0]===137 && bytes[1]===80 && bytes[2]===78 && bytes[3]===71 && bytes[4]===13 && bytes[5]===10 && bytes[6]===26 && bytes[7]===10)return 'image/png';
    if(bytes[0]===255 && bytes[1]===216 && bytes[2]===255)return 'image/jpeg';
    const prefix=String.fromCharCode(...bytes.slice(0,12));
    if(prefix.startsWith('GIF87a') || prefix.startsWith('GIF89a'))return 'image/gif';
    if(prefix.startsWith('RIFF') && prefix.slice(8,12)==='WEBP')return 'image/webp';
    return '';
  },
  fromTransfer(transfer) {
    if(!transfer)return [];
    const files=Array.from(transfer.files || []);
    if(files.length)return files;
    for(const item of Array.from(transfer.items || []))if(item.kind==='file'){const file=item.getAsFile();if(file)files.push(file);}
    if(files.length)return files;
    // Explorer file copies and Gecko native drag sources may expose nsIFile instead of File.
    if(transfer.mozGetDataAt)for(let i=0;i<(transfer.mozItemCount || 1);i++){
      try{const file=transfer.mozGetDataAt('application/x-moz-file',i)?.QueryInterface(Components.interfaces.nsIFile);if(file?.isFile())files.push({path:file.path,name:file.leafName});}catch(_){}
    }
    return files;
  },
  hasFiles(transfer) {
    return Array.from(transfer?.types || []).some(type=>['Files','application/x-moz-file'].includes(type));
  },
  async choose(win) {
    const {FilePicker}=ChromeUtils.importESModule('chrome://zotero/content/modules/filePicker.mjs');
    const picker=new FilePicker();picker.init(win,'添加文件或图片',picker.modeOpenMultiple);picker.appendFilters(picker.filterAll);
    if(await picker.show()!==picker.returnOK)return [];
    return picker.files.map(path=>({path,name:PathUtils.filename(path)}));
  },
  async read(file,win) {
    if(file.path){
      const stat=await IOUtils.stat(file.path);
      if(stat.type!=='regular')throw new Error('只能添加文件，暂不支持文件夹。');
      if(stat.size>this.MAX_FILE)throw new Error('单个附件不能超过 20 MB。');
      return IOUtils.read(file.path,{maxBytes:this.MAX_FILE+1});
    }
    if(file.size>this.MAX_FILE)throw new Error('单个附件不能超过 20 MB。');
    if(typeof file.arrayBuffer==='function')return new Uint8Array(await file.arrayBuffer());
    return new Promise((resolve,reject)=>{
      const reader=new win.FileReader();reader.onload=()=>resolve(new Uint8Array(reader.result));reader.onerror=()=>reject(new Error('无法读取附件。'));reader.readAsArrayBuffer(file);
    });
  },
  async import(file,win,existing=[]) {
    if(existing.length>=this.MAX_FILES)throw new Error('每条消息最多添加 10 个附件。');
    const bytes=await this.read(file,win);
    if(!bytes.length)throw new Error('不能添加空文件。');
    if(bytes.length>this.MAX_FILE)throw new Error('单个附件不能超过 20 MB。');
    if(existing.reduce((sum,a)=>sum+a.size,0)+bytes.length>this.MAX_TOTAL)throw new Error('每条消息附件总大小不能超过 50 MB。');
    const name=this.safeName(file.name),mime=this.imageType(bytes),id=Services.uuid.generateUUID().toString().replace(/[{}]/g,'');
    const directory=PathUtils.join(Zotero.Profile.dir,'codex-reader-workspace','attachments',id);
    // UUID directories keep copies distinct; display names need not be disk names.
    // Leave room below Windows MAX_PATH, including IOUtils' temporary suffixes.
    const extension=/\.[^.]{1,16}$/u.exec(name)?.[0] || '';
    const path=PathUtils.join(directory,'file'+extension);
    if(path.length>this.MAX_PATH)throw new Error('附件保存路径过长，请将 Zotero 配置目录移到更短的路径后重试。');
    await IOUtils.makeDirectory(directory,{ignoreExisting:false});
    try {
      await IOUtils.write(path,bytes,{noOverwrite:true});
      let text='',truncated=false;
      if(!mime && this.textExtensions.has(name.split('.').pop().toLowerCase())){
        // Decode UTF-8/UTF-16 text locally; binary/unknown files stay as readable local references.
        const Decoder=win.TextDecoder;
        const encoding=bytes[0]===255 && bytes[1]===254?'utf-16le':bytes[0]===254 && bytes[1]===255?'utf-16be':'utf-8';
        try {
          const decoded=new Decoder(encoding,{fatal:true}).decode(bytes);
          if(!decoded.includes('\0')){const remaining=Math.max(0,this.MAX_TEXT-existing.reduce((sum,a)=>sum+(a.text?.length || 0),0));text=decoded.slice(0,remaining);truncated=decoded.length>remaining;}
        }catch(_){}
      }
      return {id,name,path,size:bytes.length,kind:mime?'image':'file',mime,text,truncated};
    }catch(error){await IOUtils.remove(directory,{recursive:true,ignoreAbsent:true}).catch(()=>{});throw error;}
  },
  preview(attachment) {
    if(attachment.kind!=='image' || !attachment.path || !PathUtils.isAbsolute(attachment.path))return '';
    return Services.io.newFileURI(Zotero.File.pathToFile(attachment.path)).spec;
  },
  async discard(attachment) {
    const root=PathUtils.join(Zotero.Profile.dir,'codex-reader-workspace','attachments');
    const directory=PathUtils.parent(attachment.path);
    // Only remove this module's UUID directory; never delete user files or arbitrary model paths.
    if(PathUtils.parent(directory)!==root || !/^[\da-f-]{36}$/i.test(PathUtils.filename(directory)))return;
    await IOUtils.remove(directory,{recursive:true,ignoreAbsent:true});
  }
};
if(typeof module!=='undefined')module.exports=CodexReaderAttachments;
