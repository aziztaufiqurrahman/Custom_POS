"use server";

import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

export async function getNotifications(): Promise<{
  items: NotificationItem[];
  unread: number;
}> {
  const { userId } = await getSession();
  if (!userId) return { items: [], unread: 0 };

  const supabase = await createClient();
  const { data } = await supabase
    .from("notifications")
    .select("id, type, title, body, link, read_at, created_at")
    .order("created_at", { ascending: false })
    .limit(30);

  const items = (data ?? []) as NotificationItem[];
  const unread = items.filter((n) => !n.read_at).length;
  return { items, unread };
}

export async function markNotificationRead(
  id: string,
): Promise<{ success: boolean }> {
  const { userId } = await getSession();
  if (!userId) return { success: false };

  const supabase = await createClient();
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .is("read_at", null);
  return { success: true };
}

export async function markAllNotificationsRead(): Promise<{ success: boolean }> {
  const { userId } = await getSession();
  if (!userId) return { success: false };

  const supabase = await createClient();
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null);
  return { success: true };
}
