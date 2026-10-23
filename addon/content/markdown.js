/* DOM-only Markdown rendering. Raw HTML and image tokens remain inert text. */
var CodexReaderMarkdown = (() => {
  const parser = new marked.Marked({gfm:true,breaks:false});
  parser.use({extensions:[
    {name:'mathBlock',level:'block',start:src=>src.search(/\$\$|\\\[/),tokenizer(src) {
      const match=/^(?:\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\])(?:\n|$)/.exec(src);
      if(match)return {type:'mathBlock',raw:match[0],text:match[1] || match[2]};
    }},
    {name:'mathInline',level:'inline',start:src=>src.search(/\$|\\\(/),tokenizer(src) {
      const match=/^(?:\\\(([^]*?)\\\)|\$(?!\s|\$)((?:\\.|[^$\n])+?)\$(?!\d))/.exec(src);
      if(match)return {type:'mathInline',raw:match[0],text:match[1] || match[2]};
    }}
  ]});
  function render(doc,text) {
    const root=doc.createElementNS('http://www.w3.org/1999/xhtml','div');root.className='cr-text cr-markdown';
    const el=(tag,value)=>{const n=doc.createElementNS('http://www.w3.org/1999/xhtml',tag);if(value!==undefined)n.textContent=value;return n;};
    const decoded=value=>String(value).replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi,(all,key)=>{
      const names={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"};
      if(key[0]!=='#')return names[key] || all;
      const n=key[1].toLowerCase()==='x'?parseInt(key.slice(2),16):parseInt(key.slice(1),10);
      return n>0 && n<=0x10ffff?String.fromCodePoint(n):all;
    });
    function math(token) {
      const node=el(token.type==='mathBlock'?'div':'span');node.className='cr-math';
      try {
        // KaTeX generates this markup; model-supplied HTML never enters the parser.
        const html=katex.renderToString(token.text,{displayMode:token.type==='mathBlock',output:'mathml',trust:false,throwOnError:true,maxSize:10,maxExpand:1000,strict:'ignore'});
        const parsed=new doc.defaultView.DOMParser().parseFromString(html,'text/html');
        for(const child of [...parsed.body.childNodes])node.append(doc.importNode(child,true));
      } catch (_) {node.textContent=token.raw;}
      return node;
    }
    function append(parent,tokens) {
      for(const t of tokens || []) {
        let node;
        switch(t.type) {
          case 'space':continue;
          case 'mathBlock':case 'mathInline':node=math(t);break;
          case 'heading':node=el('h'+Math.min(6,t.depth));append(node,t.tokens);break;
          case 'paragraph':node=el('p');append(node,t.tokens);break;
          case 'text':case 'escape':
            if(t.tokens){append(parent,t.tokens);continue;}
            parent.append(doc.createTextNode(decoded(t.text)));continue;
          case 'strong':case 'em':case 'del':node=el(t.type);append(node,t.tokens);break;
          case 'codespan':node=el('code',decoded(t.text));break;
          case 'br':node=el('br');break;
          case 'hr':node=el('hr');break;
          case 'blockquote':node=el('blockquote');append(node,t.tokens);break;
          case 'code': {
            node=el('div');node.className='cr-code-block';
            const bar=el('div');bar.className='cr-code-bar';bar.append(el('span',(t.lang || '').split(/\s/)[0]));
            const copy=el('button','复制代码');copy.type='button';
            copy.addEventListener('click',()=>{
              if(typeof Zotero!=='undefined')Zotero.Utilities.Internal.copyTextToClipboard(t.text);
              else doc.defaultView.navigator.clipboard?.writeText(t.text);
              copy.textContent='已复制';
            });bar.append(copy);const pre=el('pre');pre.append(el('code',t.text));node.append(bar,pre);break;
          }
          case 'list':
            node=el(t.ordered?'ol':'ul');if(t.ordered && t.start!==1)node.start=t.start;
            for(const item of t.items){const li=el('li');if(item.task)li.append(doc.createTextNode(item.checked?'☑ ':'☐ '));append(li,item.tokens);node.append(li);}break;
          case 'table': {
            node=el('div');node.className='cr-table-scroll';const table=el('table'),head=el('thead'),row=el('tr');
            t.header.forEach((cell,i)=>{const th=el('th');th.style.textAlign=t.align[i] || '';append(th,cell.tokens);row.append(th);});head.append(row);table.append(head);
            const body=el('tbody');for(const cells of t.rows){const tr=el('tr');cells.forEach((cell,i)=>{const td=el('td');td.style.textAlign=t.align[i] || '';append(td,cell.tokens);tr.append(td);});body.append(tr);}table.append(body);node.append(table);break;
          }
          case 'link': {
            let url;try{url=new URL(decoded(t.href));}catch(_){}
            node=el(url && ['http:','https:','mailto:'].includes(url.protocol)?'a':'span');append(node,t.tokens);
            if(node.localName==='a'){
              node.href=url.href;node.rel='noopener noreferrer';node.target='_blank';
              node.addEventListener('click',event=>{if(typeof Zotero!=='undefined'){event.preventDefault();Zotero.launchURL(url.href);}});
            }break;
          }
          case 'image':node=el('span','[图片：'+(t.text || '')+']');break;
          // No innerHTML, styles, event handlers, scripts, or remote images from responses.
          default:node=el('span',t.raw || t.text || '');
        }
        parent.append(node);
      }
    }
    try {append(root,parser.lexer(String(text)));}catch(_){root.textContent=text;}
    return root;
  }
  return {render};
})();
