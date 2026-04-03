// Supabase Edge Function — Deno runtime
// Generates one XHS carousel post per day via Groq AI
// Schedule: 0 8 * * * (8am UTC)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SlideContent {
  heading: string;
  body: string;
}

interface GeneratedPost {
  title: string;
  body: string;
  hashtags: string[];
  topic_tag: string;
  slides: SlideContent[];
  cover_text: string;
}

interface SubstitutionEntry {
  field: string;
  original: string;
  replacement: string;
  count: number;
}

interface PlatformConfig {
  id: number;
  platform: string;
  enabled: boolean;
  daily_post_limit: number;
  system_prompt: string;
  banned_words: Record<string, string>;
}

interface Topic {
  id: string;
  title: string;
}

// ─── Banned word substitution ────────────────────────────────────────────────

function applyBannedWordSubstitutions(
  text: string,
  bannedWords: Record<string, string>,
  fieldName: string,
  log: SubstitutionEntry[]
): string {
  let result = text;
  for (const [banned, replacement] of Object.entries(bannedWords)) {
    // Count occurrences before replacing
    const regex = new RegExp(banned, "g");
    const matches = result.match(regex);
    if (matches && matches.length > 0) {
      log.push({
        field: fieldName,
        original: banned,
        replacement,
        count: matches.length,
      });
      result = result.replace(regex, replacement);
    }
  }
  return result;
}

function sanitizePost(
  post: GeneratedPost,
  bannedWords: Record<string, string>
): { sanitized: GeneratedPost; log: SubstitutionEntry[]; originalBody: string } {
  const log: SubstitutionEntry[] = [];
  const originalBody = post.body;

  const sanitized: GeneratedPost = {
    title: applyBannedWordSubstitutions(post.title, bannedWords, "title", log),
    body: applyBannedWordSubstitutions(post.body, bannedWords, "body", log),
    cover_text: applyBannedWordSubstitutions(post.cover_text, bannedWords, "cover_text", log),
    hashtags: post.hashtags.map((tag, i) =>
      applyBannedWordSubstitutions(tag, bannedWords, `hashtags[${i}]`, log)
    ),
    topic_tag: applyBannedWordSubstitutions(post.topic_tag, bannedWords, "topic_tag", log),
    slides: post.slides.map((slide, i) => ({
      heading: applyBannedWordSubstitutions(slide.heading, bannedWords, `slides[${i}].heading`, log),
      body: applyBannedWordSubstitutions(slide.body, bannedWords, `slides[${i}].body`, log),
    })),
  };

  return { sanitized, log, originalBody };
}

// ─── Groq API call ───────────────────────────────────────────────────────────

async function generatePost(
  systemPrompt: string,
  topicTitle: string,
  groqApiKey: string
): Promise<GeneratedPost> {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${groqApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      temperature: 0.85,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: `今天的话题是：「${topicTitle}」\n请根据这个话题，用你的日记风格写一篇小红书图文帖子。`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Groq API error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty response from Groq");

  const parsed = JSON.parse(content) as GeneratedPost;

  // Validate required fields
  if (!parsed.title || !parsed.body || !parsed.slides || parsed.slides.length === 0) {
    throw new Error("Generated post missing required fields");
  }

  // Ensure hashtags have # prefix
  parsed.hashtags = (parsed.hashtags ?? []).map((tag: string) =>
    tag.startsWith("#") ? tag : `#${tag}`
  );

  if (parsed.topic_tag && !parsed.topic_tag.startsWith("#")) {
    parsed.topic_tag = `#${parsed.topic_tag}`;
  }

  return parsed;
}

// ─── Main handler ────────────────────────────────────────────────────────────

Deno.serve(async (_req: Request) => {
  const startTime = Date.now();
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );
  const groqApiKey = Deno.env.get("GROQ_API_KEY") ?? "";

  let topicUsed = "";
  let postsGenerated = 0;
  let errorCount = 0;
  let notes = "";

  try {
    if (!groqApiKey) throw new Error("GROQ_API_KEY secret not set");

    // 1. Fetch XHS platform config
    const { data: configs, error: configErr } = await supabase
      .from("platform_config")
      .select("*")
      .eq("platform", "xhs")
      .eq("enabled", true)
      .limit(1);

    if (configErr || !configs || configs.length === 0) {
      throw new Error("No enabled XHS platform config found");
    }

    const config = configs[0] as PlatformConfig;

    // 2. Check daily limit — count ready/published posts created today
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const { count: todayCount } = await supabase
      .from("posts")
      .select("id", { count: "exact", head: true })
      .eq("platform", "xhs")
      .in("status", ["ready", "published"])
      .gte("created_at", todayStart.toISOString());

    if ((todayCount ?? 0) >= config.daily_post_limit) {
      notes = `Daily limit of ${config.daily_post_limit} already reached. Skipping.`;
      console.log(notes);

      await supabase.from("cron_logs").insert({
        topic_used: "",
        posts_generated: 0,
        error_count: 0,
        duration_ms: Date.now() - startTime,
        notes,
      });

      return new Response(JSON.stringify({ message: notes }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 3. Pick a random unused topic
    const { data: topics, error: topicErr } = await supabase
      .from("topics")
      .select("id, title")
      .eq("platform", "xhs")
      .eq("used", false);

    if (topicErr || !topics || topics.length === 0) {
      throw new Error("No unused topics available. Add more topics via SQL.");
    }

    const topic = topics[Math.floor(Math.random() * topics.length)] as Topic;
    topicUsed = topic.title;
    console.log(`Selected topic: ${topic.title}`);

    // 4. Generate post via Groq
    console.log("Calling Groq API...");
    const rawPost = await generatePost(config.system_prompt, topic.title, groqApiKey);

    // 5. Apply banned word substitutions
    const { sanitized, log: subsLog, originalBody } = sanitizePost(
      rawPost,
      config.banned_words
    );

    if (subsLog.length > 0) {
      console.log(`Applied ${subsLog.length} substitution(s):`, JSON.stringify(subsLog));
    }

    // 6. Insert post into database
    const { error: insertErr } = await supabase.from("posts").insert({
      platform: "xhs",
      topic_id: topic.id,
      title: sanitized.title,
      body: sanitized.body,
      hashtags: sanitized.hashtags,
      topic_tag: sanitized.topic_tag,
      slides: sanitized.slides,
      cover_text: sanitized.cover_text,
      original_body: originalBody,
      substitutions_log: subsLog.length > 0 ? subsLog : null,
      status: "ready",
    });

    if (insertErr) throw new Error(`Failed to insert post: ${insertErr.message}`);

    // 7. Mark topic as used
    await supabase.from("topics").update({ used: true }).eq("id", topic.id);

    postsGenerated = 1;
    console.log(`✅ Post generated and saved for topic: ${topic.title}`);

  } catch (err) {
    errorCount = 1;
    notes = err instanceof Error ? err.message : String(err);
    console.error("Generator error:", notes);
  }

  // 8. Write cron log
  await supabase.from("cron_logs").insert({
    topic_used: topicUsed,
    posts_generated: postsGenerated,
    error_count: errorCount,
    duration_ms: Date.now() - startTime,
    notes: notes || null,
  });

  return new Response(
    JSON.stringify({ posts_generated: postsGenerated, error_count: errorCount, notes }),
    { status: errorCount > 0 ? 500 : 200, headers: { "Content-Type": "application/json" } }
  );
});