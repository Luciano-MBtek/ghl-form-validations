export type FormConfig = {
  slug: string;
  name: string;
  locationId: string;
  tags?: string[];
  workflowId?: string;
  formId?: string;
};

export const FORMS: Record<string, FormConfig> = {
  "form-testing-n8n": {
    slug: "form-testing-n8n",
    name: "Form testing n8n",
    locationId: process.env.LC_LOCATION_ID!,
    tags: ["form-testing-n8n", "Validated"],
    workflowId: process.env.LC_WORKFLOW_ID || undefined,
  },
};
