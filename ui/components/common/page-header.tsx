type PageHeaderProps = {
  /** Page title — string for most pages, node for icon/badge variants. */
  title: React.ReactNode;
  /** Meta line under the title (counts, dates, FY). Omit for bare headers. */
  description?: React.ReactNode;
  /**
   * Action area — opaque node so callers pass anything (button rows,
   * selects, navigators, status indicators) without prop sprawl.
   */
  actions?: React.ReactNode;
};

/**
 * Standard page header (14/22 app pages share this exact shape):
 * responsive stack + h1 + meta + actions. Variants with eyebrows,
 * breadcrumbs, or badges (ResourceDetail, account-detail, notifications)
 * stay bespoke — see DOCS/frontend/05-duplication.md intentional list.
 */
export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-3xl font-bold font-heading text-foreground">{title}</h1>
        {description === undefined ? null : (
          <p className="text-sm text-faint font-body mt-1">{description}</p>
        )}
      </div>
      {actions === undefined ? null : <div className="flex gap-2">{actions}</div>}
    </div>
  );
}
