import { LitElement, css, html } from "lit";
import { customElement, property, query } from "lit/decorators.js";

declare const require: any;
declare const monaco: any;

@customElement("monaco-editor-wrapper")
export class MonacoEditorWrapper extends LitElement {
  @property({ type: String }) value = "";
  @property({ type: String }) language = "javascript";
  @property({ type: Boolean }) readOnly = false;
  @property({ type: String }) theme = "vs-dark";

  @query("#container") container!: HTMLElement;

  private editor: any; // monaco.editor.IStandaloneCodeEditor

  static styles = css`
    :host {
      display: block;
      width: 100%;
      height: 100%;
      min-height: 400px;
    }
    #container {
      width: 100%;
      height: 100%;
      overflow: hidden;
    }
  `;

  firstUpdated() {
    this.waitForRequire();
  }

  waitForRequire(attempts = 0) {
    if (typeof require !== 'undefined') {
        this.initLoader();
        return;
    }
    if (attempts > 20) {
        console.error("Monaco loader.js failed to load.");
        if (this.container) this.container.innerText = "Error: Could not load editor resources.";
        return;
    }
    setTimeout(() => this.waitForRequire(attempts + 1), 100);
  }

  initLoader() {
    // Load locally from the public assets we just downloaded
    require.config({ paths: { 'vs': '/monaco-editor/min/vs' }});
    require(['vs/editor/editor.main'], () => {
      this.initEditor();
    });
  }

  initEditor() {
      if (!this.container) return;
      
      // Explicitly set background to avoid "white on white" if CSS fails to load for vs-dark
      this.container.style.backgroundColor = this.theme.includes('dark') ? '#1e1e1e' : '#ffffff';
      
      this.editor = monaco.editor.create(this.container, {
        value: this.value,
        language: this.language,
        theme: this.theme,
        readOnly: this.readOnly,
        automaticLayout: false, 
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        fontSize: 14,
        fontFamily: "'Menlo', 'Monaco', 'Courier New', monospace",
      });

      // Force layout on resize
      const observer = new ResizeObserver(() => {
          this.editor?.layout();
      });
      observer.observe(this.container);

      this.editor.onDidChangeModelContent(() => {
        const newVal = this.editor.getValue();
        if (newVal !== this.value) {
            this.value = newVal;
            this.dispatchEvent(new CustomEvent("change", { detail: newVal }));
        }
      });
  }

  updated(changedProperties: Map<string, any>) {
    if (changedProperties.has("theme") && this.container) {
        this.container.style.backgroundColor = this.theme.includes('dark') ? '#1e1e1e' : '#ffffff';
    }

    if (!this.editor) return;

    if (changedProperties.has("value")) {
      if (this.editor.getValue() !== this.value) {
        this.editor.setValue(this.value);
      }
    }
    if (changedProperties.has("language")) {
       const model = this.editor.getModel();
       if (model) {
           monaco.editor.setModelLanguage(model, this.language);
       }
    }
    if (changedProperties.has("theme")) {
        monaco.editor.setTheme(this.theme);
    }
  }

  // Disable Shadow DOM so global Monaco CSS (in <head>) applies to the editor structure
  createRenderRoot() {
    return this;
  }

  render() {
    return html`
      <div 
        id="container" 
        style="width: 100%; height: 100%; min-height: 300px; overflow: hidden; display: block;"
      ></div>
    `;
  }
}
