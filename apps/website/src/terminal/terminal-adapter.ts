import { Terminal } from "@xterm/xterm";
import { ImageAddon } from "@xterm/addon-image";
import { LigaturesAddon } from "@xterm/addon-ligatures";
import { SearchAddon } from "@xterm/addon-search";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";

export interface TermAdapter {
  readonly cols: number;
  readonly rows: number;
  readonly element: HTMLElement;
  readonly fontSize: number;
  readonly searchAddon?: SearchAddon;
  init(): Promise<void>;
  write(data: string | Uint8Array): void;
  resize(columns: number, rows: number): void;
  reset(): void;
  dispose(): void;
  focus(): void;
  setFontSize(size: number): void;
}

export interface TermAdapterOptions {
  cols?: number;
  rows?: number;
  cursorBlink?: boolean;
  onData?: (data: string) => void;
  onResize?: (cols: number, rows: number) => void;
}

const defaultFontStack =
  'ui-monospace, "SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", "DejaVu Sans Mono", monospace';

export function createTerminal(element: HTMLElement, options: TermAdapterOptions): TermAdapter {
  const term = new Terminal({
    allowProposedApi: true,
    cols: options.cols ?? 120,
    rows: options.rows ?? 34,
    cursorBlink: options.cursorBlink ?? true,
    cursorStyle: "block",
    cursorInactiveStyle: "outline",
    fontSize: 14,
    fontFamily: defaultFontStack,
    lineHeight: 1.2,
    letterSpacing: 0,
    scrollback: 5000,
    screenReaderMode: true,
    smoothScrollDuration: 0,
    tabStopWidth: 8,
    // VS Code-inspired settings for better terminal rendering
    drawBoldTextInBrightColors: true,
    ignoreBracketedPasteMode: true,
    rescaleOverlappingGlyphs: true,
    scrollOnEraseInDisplay: true,
    fastScrollSensitivity: 5,
    minimumContrastRatio: 1,
    wordSeparator: " ()[]{}\",'`~!@#$%^&*-+=|\\:;<>.?/",
    macOptionIsMeta: false,
    theme: {
      background: "#010102",
      foreground: "#f7f8f8",
      cursor: "#5e6ad2",
      cursorAccent: "#010102",
      selectionBackground: "#264f78",
      black: "#1e1e1e",
      red: "#f44747",
      green: "#6a9955",
      yellow: "#d7ba7d",
      blue: "#569cd6",
      magenta: "#c586c0",
      cyan: "#4ec9b0",
      white: "#d4d4d4",
      brightBlack: "#808080",
      brightRed: "#f44747",
      brightGreen: "#6a9955",
      brightYellow: "#d7ba7d",
      brightBlue: "#569cd6",
      brightMagenta: "#c586c0",
      brightCyan: "#4ec9b0",
      brightWhite: "#ffffff",
    },
  });

  let searchAddon: SearchAddon | undefined;

  if (options.onData) {
    // onData fires for ALL terminal output bytes: printable characters,
    // control characters (Ctrl+A..Z, Tab, Backspace), and multi-byte
    // escape sequences (arrows, Home, End, F-keys, etc.). There is no
    // need for an additional onKey handler — xterm.js always calls
    // coreService.triggerDataEvent(key) after firing onKey, so both
    // events would forward the same data and cause double-sends.
    term.onData(options.onData);
  }
  if (options.onResize) {
    term.onResize(({ cols, rows }) => options.onResize?.(cols, rows));
  }

  let opened = false;

  return {
    get cols() {
      return term.cols;
    },
    get rows() {
      return term.rows;
    },
    get fontSize() {
      return term.options.fontSize ?? 14;
    },
    get searchAddon() {
      return searchAddon;
    },
    get element() {
      // xterm.js sets term.element after open(). Fall back to the container
      // element before open() is called so that scroll listeners and
      // measurements can still reference something valid.
      return term.element ?? element;
    },

    async init() {
      if (opened) return;
      try {
        const webglAddon = new WebglAddon();
        term.loadAddon(webglAddon);
      } catch {
        // WebGL unavailable — xterm.js falls back to its DOM/Canvas renderer.
      }

      try {
        const ligaturesAddon = new LigaturesAddon();
        term.loadAddon(ligaturesAddon);
      } catch {
        // Ligatures unavailable — non-critical.
      }

      try {
        const imageAddon = new ImageAddon({
          sixelSupport: true,
          sixelSizeLimit: 20000000,
          iipSupport: true,
          iipSizeLimit: 20000000,
        });
        term.loadAddon(imageAddon);
      } catch {
        // Image protocols unavailable — non-critical.
      }

      try {
        searchAddon = new SearchAddon();
        term.loadAddon(searchAddon);
      } catch {
        // Search unavailable — non-critical.
      }

      try {
        term.loadAddon(new Unicode11Addon());
      } catch {
        // Unicode 11 unavailable — non-critical.
      }

      try {
        term.loadAddon(
          new WebLinksAddon((_event, uri) => {
            window.open(uri, "_blank", "noopener");
          }),
        );
      } catch {
        // Web links unavailable — non-critical.
      }

      term.open(element);
      opened = true;

      // Auto-copy selected text to clipboard with a brief lavender flash
      // as confirmation — matches native terminal behaviour.
      term.onSelectionChange(() => {
        const selected = term.getSelection();
        if (!selected) return;
        navigator.clipboard.writeText(selected).catch(() => {});
        element.classList.add("copy-flash");
        setTimeout(() => element.classList.remove("copy-flash"), 600);
      });

      // Expose the terminal instance on the container element for E2E tests
      // that need to read buffer contents via page.evaluate().
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (element as any)._xtermInstance = term;
    },

    write(data: string | Uint8Array) {
      term.write(data);
    },

    resize(columns: number, rows: number) {
      term.resize(columns, rows);
    },

    reset() {
      term.reset();
    },

    dispose() {
      term.dispose();
    },

    focus() {
      term.focus();
    },

    setFontSize(size: number) {
      term.options.fontSize = size;
    },
  };
}
