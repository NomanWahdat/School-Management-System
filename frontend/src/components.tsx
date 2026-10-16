import { cloneElement, useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";
import { useI18n } from "./i18n";

export function Icon({ name = "school" }: { name?: string }) {
  const paths: Record<string, ReactNode> = {
    school: (
      <>
        <path d="m3 9 9-6 9 6v12H3Z" />
        <path d="M9 21v-7h6v7M7 11h1m8 0h1M12 7v2" />
      </>
    ),
    home: (
      <>
        <path d="m3 11 9-8 9 8M5 10v11h14V10M9 21v-7h6v7" />
      </>
    ),
    people: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 21v-2a6 6 0 0 1 12 0v2m2-17a3 3 0 0 1 0 6m4 11v-2a6 6 0 0 0-4-5" />
      </>
    ),
    check: (
      <>
        <path d="m6 12 4 4 8-9" />
        <rect x="3" y="3" width="18" height="18" rx="5" />
      </>
    ),
    book: (
      <>
        <path d="M12 5v16M3 4c4-1 6 0 9 2 3-2 5-3 9-2v15c-4-1-6 0-9 2-3-2-5-3-9-2Z" />
      </>
    ),
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="3" />
        <path d="M7 3v4m10-4v4M3 11h18m-13 4h2m4 0h2" />
      </>
    ),
    money: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="3" />
        <circle cx="12" cy="12" r="3" />
        <path d="M6 12h.01M18 12h.01" />
      </>
    ),
    chart: (
      <>
        <path d="M4 3v18h17M8 17v-5m5 5V7m5 10V4" />
      </>
    ),
    notice: (
      <>
        <path d="m4 9 15-6v18L4 15Zm0 0v6M8 16l2 5h3l-2-4" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="m9 3-1 3-3 1v3l-2 2 2 2v3l3 1 1 3h6l1-3 3-1v-3l2-2-2-2V7l-3-1-1-3Z" />
      </>
    ),
    arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
    plus: <path d="M12 5v14M5 12h14" />,
  };
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] || paths.school}
    </svg>
  );
}

export function Brand({
  name,
  logo,
  compact = false,
}: {
  name: string;
  logo?: string | null;
  compact?: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className={`brand ${compact ? "compact" : ""}`}>
      <div className="brand-mark">
        {logo ? <img src={logo} alt={`${name} logo`} /> : <Icon />}
      </div>
      <div>
        <strong>{name}</strong>
        <small>{t("ui.School workspace")}</small>
      </div>
    </div>
  );
}

export function Heading({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <header className="page-heading">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {children && <div className="heading-actions">{children}</div>}
    </header>
  );
}

export function Empty({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon name="book" />
      </span>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {children}
    </div>
  );
}

export function Field({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children:
    ((id: string) => ReactNode) | import("react").ReactElement<{ id?: string }>;
}) {
  const id = useId();
  return (
    <div className={`field ${error ? "field-error" : ""}`}>
      <div className="field-label">
        <label htmlFor={id}>{label}</label>
        {required && <span aria-hidden="true"> *</span>}
      </div>
      {typeof children === "function"
        ? children(id)
        : cloneElement(children, { id })}
      {error && <small role="alert">{error}</small>}
    </div>
  );
}

export function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const { t } = useI18n();
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    dialog?.showModal();
    return () => {
      dialog?.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="dialog-header">
        <h2 id={titleId}>{title}</h2>
        <button type="button" className="button secondary" onClick={onClose}>
          {t("ui.Close")}
        </button>
      </div>
      {children}
    </dialog>
  );
}

export function Status({ value }: { value: unknown }) {
  const { t } = useI18n();
  const label = String(value ?? "");
  return (
    <span
      className={`status ${["Active", "Paid", "Present", "Published", "Completed"].includes(label) ? "positive" : ["Absent", "Inactive", "Overdue", "Suspended"].includes(label) ? "negative" : "neutral"}`}
    >
      {t(`status.${label}`, label)}
    </span>
  );
}

export function Loading() {
  const { t } = useI18n();
  return (
    <div className="loading" role="status">
      <span className="spinner" />
      {t("ui.Loading school records…")}
    </div>
  );
}
