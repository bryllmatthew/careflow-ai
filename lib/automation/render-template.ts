/**
 * Plain {{variable}} substitution against a fixed whitelist -- never eval,
 * never a templating library with its own expression language. An unknown
 * {{token}} is left untouched rather than silently dropped, so a broken
 * template is visibly broken (docs/PRODUCT_SPEC.md Phase 4 section 10-11:
 * "never allow arbitrary code execution through template variables").
 */
export const TEMPLATE_VARIABLES = [
  "patient_name",
  "clinic_name",
  "practitioner_name",
  "service_name",
  "appointment_date",
  "appointment_time",
  "clinic_address",
] as const;
export type TemplateVariable = (typeof TEMPLATE_VARIABLES)[number];

export type TemplateContext = Partial<Record<TemplateVariable, string>>;

const TOKEN_PATTERN = /\{\{\s*([a-zA-Z_]+)\s*\}\}/g;

export function renderTemplate(body: string, context: TemplateContext): string {
  return body.replace(TOKEN_PATTERN, (match, name: string) => {
    if ((TEMPLATE_VARIABLES as readonly string[]).includes(name)) {
      return context[name as TemplateVariable] ?? "";
    }
    return match;
  });
}

/**
 * Used when saving a template (Settings > Notifications): rejects any
 * {{token}} that isn't in the supported whitelist, per the Phase 4 brief
 * ("do not allow users to insert unsupported variables without validation").
 */
export function findUnsupportedVariables(body: string): string[] {
  const found = new Set<string>();
  for (const match of body.matchAll(TOKEN_PATTERN)) {
    const name = match[1]!;
    if (!(TEMPLATE_VARIABLES as readonly string[]).includes(name)) {
      found.add(name);
    }
  }
  return Array.from(found);
}
