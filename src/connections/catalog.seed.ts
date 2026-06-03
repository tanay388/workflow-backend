/** GA toolkits per TRD §4.5 / Phase 09. All others from v1 list are beta. */
export const GA_TOOLKIT_SLUGS = new Set([
  'gmail',
  'slack',
  'notion',
  'googlecalendar',
  'googlesheets',
  'googledrive',
  'outlook',
  'hubspot',
]);

export type CatalogSeedRow = {
  slug: string;
  label: string;
  logoUrl: string;
  supportsTriggers: boolean;
  category: string;
  status: 'ga' | 'beta';
};

/** Idempotent seed rows — mirrors growy-user availableToolkits.ts */
export const INTEGRATION_CATALOG_SEED: CatalogSeedRow[] = [
  { slug: 'gmail', label: 'Gmail', logoUrl: 'https://cdn.growy.app/integrations/gmail.png', supportsTriggers: true, category: 'communication', status: 'ga' },
  { slug: 'slack', label: 'Slack', logoUrl: 'https://cdn.growy.app/integrations/slack.png', supportsTriggers: true, category: 'communication', status: 'ga' },
  { slug: 'notion', label: 'Notion', logoUrl: 'https://cdn.growy.app/integrations/notion.png', supportsTriggers: true, category: 'productivity', status: 'ga' },
  { slug: 'googlecalendar', label: 'Google Calendar', logoUrl: 'https://cdn.growy.app/integrations/google-calendar.png', supportsTriggers: true, category: 'productivity', status: 'ga' },
  { slug: 'googlesheets', label: 'Google Sheets', logoUrl: 'https://cdn.growy.app/integrations/google-sheets.png', supportsTriggers: true, category: 'productivity', status: 'ga' },
  { slug: 'googledrive', label: 'Google Drive', logoUrl: 'https://cdn.growy.app/integrations/google-drive.png', supportsTriggers: true, category: 'productivity', status: 'ga' },
  { slug: 'outlook', label: 'Outlook', logoUrl: 'https://cdn.growy.app/integrations/outlook.png', supportsTriggers: true, category: 'communication', status: 'ga' },
  { slug: 'hubspot', label: 'HubSpot', logoUrl: 'https://cdn.growy.app/integrations/hubspot.png', supportsTriggers: true, category: 'crm', status: 'ga' },
  { slug: 'microsoft_teams', label: 'Microsoft Teams', logoUrl: 'https://cdn.growy.app/integrations/microsoft-teams.png', supportsTriggers: false, category: 'communication', status: 'beta' },
  { slug: 'googledocs', label: 'Google Docs', logoUrl: 'https://cdn.growy.app/integrations/google-docs.png', supportsTriggers: true, category: 'productivity', status: 'beta' },
  { slug: 'excel', label: 'Excel', logoUrl: 'https://cdn.growy.app/integrations/excel-image.png', supportsTriggers: false, category: 'productivity', status: 'beta' },
  { slug: 'dynamics365', label: 'Dynamics 365', logoUrl: 'https://cdn.growy.app/integrations/dynamics365.png', supportsTriggers: false, category: 'crm', status: 'beta' },
  { slug: 'docusign', label: 'Docusign', logoUrl: 'https://cdn.growy.app/integrations/docusign.png', supportsTriggers: false, category: 'legal', status: 'beta' },
  { slug: 'bamboohr', label: 'BambooHR', logoUrl: 'https://cdn.growy.app/integrations/bamboohr.png', supportsTriggers: false, category: 'hr', status: 'beta' },
  { slug: 'xero', label: 'Xero', logoUrl: 'https://cdn.growy.app/integrations/xero.png', supportsTriggers: false, category: 'finance', status: 'beta' },
  { slug: 'quickbooks', label: 'Quickbooks', logoUrl: 'https://cdn.growy.app/integrations/quickbooks.png', supportsTriggers: false, category: 'finance', status: 'beta' },
  { slug: 'shopify', label: 'Shopify', logoUrl: 'https://cdn.growy.app/integrations/shopify.png', supportsTriggers: false, category: 'commerce', status: 'beta' },
  { slug: 'confluence', label: 'Confluence', logoUrl: 'https://cdn.growy.app/integrations/confluence.png', supportsTriggers: false, category: 'productivity', status: 'beta' },
  { slug: 'share_point', label: 'Sharepoint', logoUrl: 'https://cdn.growy.app/integrations/sharepoint.png', supportsTriggers: false, category: 'productivity', status: 'beta' },
  { slug: 'whatsapp', label: 'Whatsapp', logoUrl: 'https://cdn.growy.app/integrations/whatsapp.png', supportsTriggers: true, category: 'communication', status: 'beta' },
  { slug: 'youtube', label: 'YouTube', logoUrl: 'https://cdn.growy.app/integrations/youtube.png', supportsTriggers: true, category: 'social', status: 'beta' },
  { slug: 'stripe', label: 'Stripe', logoUrl: 'https://cdn.growy.app/integrations/stripe.png', supportsTriggers: true, category: 'finance', status: 'beta' },
  { slug: 'facebook', label: 'Facebook', logoUrl: 'https://cdn.growy.app/integrations/facebook.png', supportsTriggers: false, category: 'social', status: 'beta' },
  { slug: 'linkedin', label: 'Linkedin', logoUrl: 'https://cdn.growy.app/integrations/linkedin.png', supportsTriggers: false, category: 'social', status: 'beta' },
  { slug: 'reddit', label: 'Reddit', logoUrl: 'https://cdn.growy.app/integrations/reddit.png', supportsTriggers: false, category: 'social', status: 'beta' },
  { slug: 'firecrawl', label: 'Firecrawl', logoUrl: 'https://cdn.growy.app/integrations/firecrawl.png', supportsTriggers: false, category: 'data', status: 'beta' },
  { slug: 'figma', label: 'Figma', logoUrl: 'https://cdn.growy.app/integrations/figma.png', supportsTriggers: false, category: 'design', status: 'beta' },
  { slug: 'one_drive', label: 'OneDrive', logoUrl: 'https://cdn.growy.app/integrations/onedrive.png', supportsTriggers: true, category: 'productivity', status: 'beta' },
];
