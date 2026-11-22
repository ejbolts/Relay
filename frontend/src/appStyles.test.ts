import { describe, expect, it } from 'vitest';

const sources = import.meta.glob<string>('./*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const stylesheets = Object.keys(import.meta.glob('./*.css')).map((file) => file.slice(2));
const STYLESHEET_IMPORT = /^import '\.\/([^']+\.css)';\r?$/gm;

function stylesheetsImportedBy(file: string): string[] {
  return [...sources[`./${file}`].matchAll(STYLESHEET_IMPORT)].map((match) => match[1]);
}

const listed = stylesheetsImportedBy('appStyles.ts');
const others = Object.keys(sources)
  .map((file) => file.slice(2))
  .filter((file) => !/\.test\.tsx?$/.test(file) && file !== 'appStyles.ts');

describe('the stylesheet list', () => {
  it('holds every stylesheet a screen or component imports', () => {
    // A stylesheet imported only from the signed-in app would load after every sheet in the
    // list, which changes which of two equally specific rules wins.
    const imported = others.flatMap((file) =>
      stylesheetsImportedBy(file).map((sheet) => ({ sheet, file })),
    );
    expect(imported.length).toBeGreaterThan(50);
    expect(
      imported
        .filter(({ sheet }) => !listed.includes(sheet))
        .map(({ sheet, file }) => `${sheet} (imported by ${file})`),
    ).toEqual([]);
  });

  it('lists each stylesheet once, and only ones that exist', () => {
    expect(new Set(listed).size).toBe(listed.length);
    expect(listed.filter((sheet) => !stylesheets.includes(sheet))).toEqual([]);
  });

  it('loads the base sheets after the screen and component sheets', () => {
    // Base rules such as buttons are written to win over a component's rule of equal weight.
    const base = ['styles.css', 'pulse.css', 'buttons.css', 'popupDialog.css', 'lightMode.css'];
    const positions = base.map((sheet) => listed.indexOf(sheet));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(positions[0]).toBeGreaterThan(listed.indexOf('toast.css'));
    expect(listed.indexOf('toast.css')).toBeGreaterThanOrEqual(0);
  });

  it('is the first thing the page loads', () => {
    const firstImport = sources['./main.tsx']
      .split(/\r?\n/)
      .find((line) => line.startsWith('import '));
    expect(firstImport).toBe("import './appStyles';");
    // The entry leaves stylesheet order to the list.
    expect(stylesheetsImportedBy('main.tsx')).toEqual([]);
  });
});
