import { useEffect, useState } from "react";
import type { APIClient, Row } from "./api";
import { text } from "./api";
import { Dialog } from "./components";
import { useI18n, useWords } from "./i18n";

export function Notifications({
  api,
  onNavigate,
}: {
  api: APIClient;
  onNavigate: (section: string, intent?: string, classId?: string) => void;
}) {
  const w = useWords();
  const { formatDate } = useI18n();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [unread, setUnread] = useState(0);
  const [version, setVersion] = useState(0);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    const load = () =>
      api
        .request<{ results: Row[]; unread_count: number }>("notifications/")
        .then((data) => {
          if (live) {
            setRows(data.results);
            setUnread(data.unread_count);
            setError("");
          }
        })
        .catch((err) => {
          if (live && err.name !== "AbortError") setError(err.message);
        });
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 60000);
    const changed = () => {
      void load();
    };
    window.addEventListener("school-data-changed", changed);
    return () => {
      live = false;
      clearInterval(timer);
      window.removeEventListener("school-data-changed", changed);
    };
  }, [api, version]);
  return (
    <>
      <button
        className="button secondary notification-button"
        aria-label={`${w("Notifications")} (${unread})`}
        onClick={() => {
          setOpen(true);
          setVersion((v) => v + 1);
        }}
      >
        {w("Notifications")}
        {unread > 0 && <span className="notification-count">{unread}</span>}
      </button>
      {open && (
        <Dialog title={w("Notifications")} onClose={() => setOpen(false)}>
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
          {unread > 0 && (
            <button
              className="button secondary"
              onClick={async () => {
                try {
                  await api.request("notifications/", {
                    method: "POST",
                    body: JSON.stringify({ all: true }),
                  });
                  setVersion((v) => v + 1);
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Try again");
                }
              }}
            >
              {w("Mark all read")}
            </button>
          )}
          <div className="notification-list">
            {rows.map((row) => (
              <button
                className={`notification-item ${!row.read_at ? "unread" : ""}`}
                key={row.id}
                onClick={async () => {
                  try {
                    await api.request("notifications/", {
                      method: "POST",
                      body: JSON.stringify({ id: row.id }),
                    });
                    setOpen(false);
                    setVersion((v) => v + 1);
                    onNavigate(
                      text(row.section),
                      undefined,
                      row.school_class_id
                        ? String(row.school_class_id)
                        : undefined,
                    );
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Try again");
                  }
                }}
              >
                <strong>{w(text(row.title))}</strong>
                <span>{text(row.message)}</span>
                <small>{formatDate(text(row.created_at))}</small>
              </button>
            ))}
            {!rows.length && !error && <p>{w("You are all caught up")}</p>}
          </div>
          <small>
            {w("Notifications update every minute while this page is open.")}
          </small>
        </Dialog>
      )}
    </>
  );
}
