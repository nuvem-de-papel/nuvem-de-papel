import { createClient } from "@/lib/supabase/server";

export type Publication = {
  id: string;
  slug: string;
  title: string;
  category: string;
  excerpt: string | null;
  readingMinutes: number | null;
  publishedAt: string;
};

type PublicationRow = {
  id: string;
  slug: string;
  title: string;
  category: string;
  excerpt: string | null;
  reading_minutes: number | null;
  published_at: string;
};

export async function getPublications(): Promise<Publication[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("publications")
    .select("id, slug, title, category, excerpt, reading_minutes, published_at")
    .order("published_at", { ascending: false })
    .returns<PublicationRow[]>();

  if (error) {
    console.error("getPublications:", error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    category: row.category,
    excerpt: row.excerpt,
    readingMinutes: row.reading_minutes,
    publishedAt: row.published_at,
  }));
}
