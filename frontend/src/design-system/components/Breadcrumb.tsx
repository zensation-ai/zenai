import './Breadcrumb.css';

export interface BreadcrumbItem {
  label: string;
  href?: string;
  onClick?: () => void;
}

export interface BreadcrumbProps {
  items: BreadcrumbItem[];
  separator?: string;
  maxItems?: number;
  className?: string;
}

export function Breadcrumb({
  items,
  separator = '/',
  maxItems,
  className,
}: BreadcrumbProps) {
  const shouldCollapse = maxItems != null && items.length > maxItems;

  let visibleItems: Array<BreadcrumbItem | '__ellipsis__'>;

  if (shouldCollapse) {
    // Always show first and last; collapse the middle
    const first = items[0];
    const last = items[items.length - 1];
    visibleItems = [first, '__ellipsis__' as const, last];
  } else {
    visibleItems = items;
  }

  const wrapperClass = ['ds-breadcrumb', className ?? '']
    .filter(Boolean)
    .join(' ');

  return (
    <nav aria-label="Breadcrumb" className={wrapperClass}>
      <ol className="ds-breadcrumb__list">
        {visibleItems.map((item, idx) => {
          const isLast = idx === visibleItems.length - 1;

          if (item === '__ellipsis__') {
            return (
              <li key="ellipsis" className="ds-breadcrumb__item">
                <span className="ds-breadcrumb__ellipsis" aria-hidden="true">
                  …
                </span>
                {!isLast && (
                  <span className="ds-breadcrumb__sep" aria-hidden="true">
                    {separator}
                  </span>
                )}
              </li>
            );
          }

          return (
            <li key={`${item.label}-${idx}`} className="ds-breadcrumb__item">
              {isLast ? (
                <span
                  className="ds-breadcrumb__current"
                  aria-current="page"
                >
                  {item.label}
                </span>
              ) : item.href ? (
                <a
                  href={item.href}
                  className="ds-breadcrumb__link"
                  onClick={item.onClick}
                >
                  {item.label}
                </a>
              ) : item.onClick ? (
                <button
                  type="button"
                  className="ds-breadcrumb__link ds-breadcrumb__link--btn"
                  onClick={item.onClick}
                >
                  {item.label}
                </button>
              ) : (
                <span className="ds-breadcrumb__link ds-breadcrumb__link--plain">
                  {item.label}
                </span>
              )}
              {!isLast && (
                <span className="ds-breadcrumb__sep" aria-hidden="true">
                  {separator}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
