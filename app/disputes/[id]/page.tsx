"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchJson } from "@/lib/fetch-json";
import { useAuthedUser } from "@/components/session-context";
import { PageLoading } from "@/components/page-loading";

interface DisputePayload {
  id: string;
  title: string;
  description: string;
  photoPath: string | null;
  projectId: string | null;
  orderId: string | null;
  createdAt: string;
  createdById: string;
  creatorName: string | null;
}

interface MessagePayload {
  id: string;
  body: string;
  createdAt: string;
  authorId: string;
  authorName: string | null;
}

export default function DisputeDetailPage() {
  const params = useParams<{ id: string }>();
  const user = useAuthedUser();
  const qc = useQueryClient();
  const id = params?.id;
  const [body, setBody] = useState("");

  const threadQuery = useQuery({
    queryKey: ["disputes", "detail", id],
    queryFn: () =>
      fetchJson<{ dispute: DisputePayload; messages: MessagePayload[] }>(
        `/api/disputes/${id}`,
      ),
    enabled: !!user && !!id,
    refetchInterval: 5_000,
  });

  const sendMessage = useMutation({
    mutationFn: async () => {
      if (!id) throw new Error("Missing dispute");
      return fetchJson<{ message: unknown }>(
        `/api/disputes/${id}/messages`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ body }),
        },
      );
    },
    onSuccess: async () => {
      setBody("");
      await qc.invalidateQueries({ queryKey: ["disputes", "detail", id] });
      await qc.invalidateQueries({ queryKey: ["disputes", "list"] });
    },
  });

  const [attachmentHidden, setAttachmentHidden] = useState(false);
  const trimmedPhotoPath =
    threadQuery.data?.dispute.photoPath?.trim() ?? "";
  useEffect(() => {
    setAttachmentHidden(false);
  }, [id, trimmedPhotoPath]);
  const photoUrl =
    id && trimmedPhotoPath ? `/api/disputes/${id}/photo` : null;

  if (!user) return null;
  if (!id) return null;

  const { data, refetch } = threadQuery;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <div>
        <Link
          href="/disputes"
          className="text-xs font-semibold text-[color:var(--primary)] hover:underline"
        >
          ← All disputes
        </Link>

        {data ? (
          <>
            <h1 className="mt-3 text-2xl font-semibold">{data.dispute.title}</h1>
            <p className="mt-2 text-sm whitespace-pre-wrap text-[color:var(--text-muted)]">
              {data.dispute.description}
            </p>
            <div className="mt-3 flex flex-wrap gap-3 text-xs text-[color:var(--text-muted)]">
              {data.dispute.projectId ? (
                <Link
                  className="font-semibold text-[color:var(--primary)]"
                  href={`/projects/${data.dispute.projectId}`}
                >
                  Linked project →
                </Link>
              ) : null}
              {data.dispute.orderId ? (
                <Link
                  className="font-semibold text-[color:var(--primary)]"
                  href={`/orders/${data.dispute.orderId}`}
                >
                  Linked order →
                </Link>
              ) : null}
            </div>
            {photoUrl && !attachmentHidden ? (
              <div className="mt-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photoUrl}
                  alt="Dispute attachment"
                  loading="lazy"
                  onError={() => setAttachmentHidden(true)}
                  className="max-h-72 max-w-full rounded-xl border border-[color:var(--border)] object-contain"
                />
              </div>
            ) : null}
          </>
        ) : threadQuery.isPending ? (
          <PageLoading message="Loading thread…" centered={false} className="mt-4" />
        ) : threadQuery.isError ? (
          <div className="mt-4 text-sm text-[color:var(--danger)]">
            {(threadQuery.error as Error).message}{" "}
            <button
              type="button"
              className="underline"
              onClick={() => refetch()}
            >
              Retry
            </button>
          </div>
        ) : null}
      </div>

      <section className="card flex flex-col overflow-hidden">
        <header className="border-b border-[color:var(--border)] px-4 py-3 text-sm font-semibold">
          Conversation <span className="font-normal text-[color:var(--text-muted)]">(auto-refresh)</span>
        </header>
        <div className="max-h-[480px] min-h-[200px] space-y-3 overflow-y-auto px-4 py-4">
          {(data?.messages ?? []).length === 0 ? (
            <p className="text-sm text-[color:var(--text-muted)]">
              No messages yet—explain what blocked you below.
            </p>
          ) : (
            (data?.messages ?? []).map((m) => (
              <div
                key={m.id}
                className={`rounded-xl border border-[color:var(--border)] px-3 py-2 text-sm ${
                  m.authorId === user.id ? "bg-[color:var(--primary)]/10" : ""
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-1 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
                  <span>{m.authorName ?? "Someone"}</span>
                  <span>{new Date(m.createdAt).toLocaleTimeString()}</span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-[color:var(--text)]">
                  {m.body}
                </p>
              </div>
            ))
          )}
        </div>
        <form
          className="flex flex-col gap-2 border-t border-[color:var(--border)] p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!body.trim()) return;
            sendMessage.mutate();
          }}
        >
          <label className="block text-xs font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
            Reply
          </label>
          <textarea
            className="input min-h-[80px]"
            placeholder="Reach your PM / logistics coordinator / super admin here…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            disabled={sendMessage.isPending || !data}
          />
          {sendMessage.error ? (
            <p className="text-xs text-[color:var(--danger)]">
              {(sendMessage.error as Error).message}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={sendMessage.isPending || !data || !body.trim()}
            className="btn btn-primary self-end"
          >
            {sendMessage.isPending ? "Sending…" : "Send"}
          </button>
        </form>
      </section>
    </div>
  );
}
