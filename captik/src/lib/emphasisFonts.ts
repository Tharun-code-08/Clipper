// Fonts offered in the Text-tab "Emphasis → Font" dropdown. Every value MUST be a family the export
// gate can pre-load — i.e. present in buildFontsCss() (Lambda/in-browser export) and globals.css
// (preview) — or emphasised words render a fallback in the export while the preview looks right
// (that's exactly the "font changes on export" bug for the "Luckiest Guy" / "Times New Roman"
// choices, whose registered faces were "LuckiestGuy" / "TimesNewRomanBold"). The user's GLOBAL
// custom font is added on top at the UI layer — it's embedded per render, so it needs no entry here.
//
// Kept in a pure module (not inside the client TextTab component) so the bundled-font invariant in
// fontFamilies.spec.ts can import it without pulling in React/UI deps.
export const EMPHASIS_FONT_CHOICES: string[] = ['Inter', 'Anton', 'Poppins', 'Montserrat', 'Luckiest Guy', 'Times New Roman'];
