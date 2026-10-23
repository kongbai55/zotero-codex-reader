Bundled for offline response rendering:

- Marked 17.0.5, MIT, https://github.com/markedjs/marked — `marked.js`, license in `marked-LICENSE.md`.
- KaTeX 0.16.22, MIT, https://github.com/KaTeX/KaTeX — `katex.min.js`, `katex.min.css`, WOFF2 fonts; license in `katex-LICENSE.txt`.

Marked is used only as a tokenizer. Response HTML is never inserted into the document. KaTeX produces MathML with trust disabled and bounded macro expansion. No CDN or runtime download is used.
