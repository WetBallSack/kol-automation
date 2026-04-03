// XHS (RedNote) Automated Carousel Poster
// Runtime: Node.js on Railway (Hong Kong region)
// Schedule: 0 9 * * * (9am UTC — 1h after generator)

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { chromium, Browser, BrowserContext, Page } from "playwright";
import { createCanvas, registerFont } from "canvas";
import * as fs from "fs";
import * as path from "path";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SlideContent {
  heading: string;
  body: string;
}

interface Post {
  id: string;
  title: string;
  body: string;
  hashtags: string[];
  topic_tag: string;
  slides: SlideContent[];
  cover_text: string;
  retry_count: number;
}

interface XhsAccount {
  id: string;
  username: string;
  cookies: Record<string, unknown> | unknown[];
  status: string;
  posts_today: number;
}

interface ColorTheme {
  bg: string;
  accent: string;
  text: string;
  subtext: string;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const SLIDES_DIR = "/tmp/xhs_slides";

const COLOR_THEMES: ColorTheme[] = [
  { bg: "#1a1a2e", accent: "#e94560", text: "#ffffff", subtext: "#cccccc" },
  { bg: "#0f2027", accent: "#00d2ff", text: "#ffffff", subtext: "#b0c4de" },
  { bg: "#2d2d2d", accent: "#f5a623", text: "#ffffff", subtext: "#dddddd" },
  { bg: "#fdf6e3", accent: "#5c3d2e", text: "#2d2d2d", subtext: "#555555" },
  { bg: "#f8f9fa", accent: "#6c63ff", text: "#1a1a2e", subtext: "#444444" },
];

const BAN_KEYWORDS = ["违规", "封禁", "限流", "异常", "审核不通过"]; 

// ─── Canvas Helpers ───────────────────────────────────────────────────────────

function wrapCJKText(
  ctx: ReturnType<typeof createCanvas>["getContext"],
  text: string,
  maxWidth: number,
  fontSize: number
): string[] {
  const lines: string[] = [];
  // Approximate chars per line based on font size and maxWidth
  const charsPerLine = Math.floor(maxWidth / (fontSize * 0.9));
  let current = "";

  for (const char of text) {
    current += char;
    if (current.length >= charsPerLine) {
      lines.push(current);
      current = "";
    }
  }
  if (current.length > 0) lines.push(current);
  return lines;
}

function generateSlideImage(
  slideIndex: number,
  totalSlides: number,
  heading: string,
  body: string,
  coverText: string,
  isCover: boolean,
  theme: ColorTheme,
  postTitle: string
): Buffer {
  const WIDTH = 1080;
  const HEIGHT = 1350;
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");

  // Background
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Decorative accent bar (left side)
  ctx.fillStyle = theme.accent;
  ctx.fillRect(60, 80, 8, 140);

  // Bottom accent bar
  ctx.fillStyle = theme.accent;
  ctx.globalAlpha = 0.3;
  ctx.fillRect(0, HEIGHT - 6, WIDTH, 6);
  ctx.globalAlpha = 1;

  if (isCover) {
    // Cover slide: large cover text + title
    ctx.fillStyle = theme.accent;
    ctx.font = `bold 68px "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`;
    ctx.textAlign = "center";

    const coverLines = wrapCJKText(ctx as any, coverText, WIDTH - 160, 68);
    coverLines.forEach((line, i) => {
      ctx.fillText(line, WIDTH / 2, 420 + i * 90);
    });

    ctx.fillStyle = theme.text;
    ctx.font = `36px "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`;
    const titleLines = wrapCJKText(ctx as any, postTitle, WIDTH - 200, 36);
    titleLines.forEach((line, i) => {
      ctx.fillText(line, WIDTH / 2, 620 + i * 54);
    });

    // "多图" indicator at bottom
    ctx.fillStyle = theme.subtext;
    ctx.font = `24px "PingFang SC", "Microsoft YaHei", sans-serif`;
    ctx.fillText(`共 ${totalSlides} 张 →`, WIDTH / 2, HEIGHT - 80);
  } else {
    // Content slide: heading + body
    ctx.textAlign = "left";

    // Heading
    ctx.fillStyle = theme.accent;
    ctx.font = `bold 52px "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`;
    const headingLines = wrapCJKText(ctx as any, heading, WIDTH - 160, 52);
    headingLines.forEach((line, i) => {
      ctx.fillText(line, 90, 260 + i * 72);
    });

    const bodyStartY = 260 + headingLines.length * 72 + 60;

    // Body text
    ctx.fillStyle = theme.text;
    ctx.font = `34px "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`;
    const bodyLines = wrapCJKText(ctx as any, body, WIDTH - 180, 34);
    bodyLines.forEach((line, i) => {
      ctx.fillText(line, 90, bodyStartY + i * 52);
    });

    // Slide number bottom-right
    ctx.fillStyle = theme.subtext;
    ctx.font = `26px "PingFang SC", "Microsoft YaHei", sans-serif`;
    ctx.textAlign = "right";
    ctx.fillText(`${slideIndex + 1} / ${totalSlides}`, WIDTH - 60, HEIGHT - 60);
  }

  return canvas.toBuffer("image/png");
}

async function generateCarouselImages(post: Post, theme: ColorTheme): Promise<string[]> {
  // Ensure slides dir exists
  if (!fs.existsSync(SLIDES_DIR)) {
    fs.mkdirSync(SLIDES_DIR, { recursive: true });
  }

  // Clean previous slides
  const existing = fs.readdirSync(SLIDES_DIR).filter((f) => f.endsWith(".png"));
  existing.forEach((f) => fs.unlinkSync(path.join(SLIDES_DIR, f)));

  const allSlides = post.slides ?? [];
  const totalSlides = allSlides.length + 1; // +1 for cover
  const filePaths: string[] = [];

  // Cover slide (index 0)
  const coverBuffer = generateSlideImage(
    0,
    totalSlides,
    "",
    "",
    post.cover_text ?? post.title,
    true,
    theme,
    post.title
  );
  const coverPath = path.join(SLIDES_DIR, "slide_001.png");
  fs.writeFileSync(coverPath, coverBuffer);
  filePaths.push(coverPath);

  // Content slides
  for (let i = 0; i < allSlides.length; i++) {
    const slide = allSlides[i];
    const buf = generateSlideImage(
      i + 1,
      totalSlides,
      slide.heading ?? "",
      slide.body ?? "",
      "",
      false,
      theme,
      post.title
    );
    const filePath = path.join(SLIDES_DIR, `slide_${String(i + 2).padStart(3, "0")}.png`);
    fs.writeFileSync(filePath, buf);
    filePaths.push(filePath);
  }

  console.log(`Generated ${filePaths.length} carousel images`);
  return filePaths;
}

// ─── Cookie Helpers ───────────────────────────────────────────────────────────

function isValidCookieArray(cookies: unknown): boolean {
  return Array.isArray(cookies) && cookies.length > 0;
}

async function loadCookies(
  context: BrowserContext,
  account: XhsAccount,
  page: Page,
  supabase: SupabaseClient
): Promise<void> {
  if (isValidCookieArray(account.cookies)) {
    console.log("Loading saved cookies...");
    await context.addCookies(account.cookies as Parameters<BrowserContext["addCookies"]>[0]);
  } else {
    // First-time login — QR scan
    console.log("No saved cookies. Navigating to XHS for QR login...");
    await page.goto("https://www.xiaohongshu.com", { waitUntil: "networkidle" });
    console.log("请在60秒内扫码登录小红书...");
    await page.waitForTimeout(60000);

    const freshCookies = await context.cookies();
    await supabase
      .from("xhs_accounts")
      .update({ cookies: freshCookies, status: "active" })
      .eq("id", account.id);

    console.log("Cookies saved. Account marked active.");
  }
}

async function saveCookies(
  context: BrowserContext,
  account: XhsAccount,
  supabase: SupabaseClient
): Promise<void> {
  const freshCookies = await context.cookies();
  await supabase
    .from("xhs_accounts")
    .update({ cookies: freshCookies })
    .eq("id", account.id);
  console.log("Cookies refreshed in database.");
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  let browser: Browser | null = null;

  // 1. Fetch oldest ready post
  const { data: posts, error: postErr } = await supabase
    .from("posts")
    .select("*")
    .eq("platform", "xhs")
    .eq("status", "ready")
    .order("created_at", { ascending: true })
    .limit(1);

  if (postErr || !posts || posts.length === 0) {
    console.log("No ready posts available. Exiting.");
    process.exit(0);
  }

  const post = posts[0] as Post;
  console.log(`Found ready post: ${post.title}`);

  // 2. Fetch eligible account
  const { data: accounts, error: accErr } = await supabase
    .from("xhs_accounts")
    .select("*")
    .in("status", ["active", "needs_login"])
    .eq("is_shadowbanned", false)
    .lt("posts_today", 1)
    .limit(1);

  if (accErr || !accounts || accounts.length === 0) {
    console.log("No eligible XHS accounts. Exiting.");
    process.exit(0);
  }

  const account = accounts[0] as XhsAccount;
  console.log(`Using account: ${account.username}`);

  // Choose random color theme
  const theme = COLOR_THEMES[Math.floor(Math.random() * COLOR_THEMES.length)];

  try {
    // 3. Generate carousel images
    const imagePaths = await generateCarouselImages(post, theme);

    // 4. Launch browser
    browser = await chromium.launch({
      headless: IS_PRODUCTION,
      args: [
        "--disable-blink-features=AutomationControlled",
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
      ],
    });

    const context = await browser.newContext({
      locale: "zh-CN",
      timezoneId: "Asia/Shanghai",
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    });

    const page = await context.newPage();

    // 5. Handle cookies / login
    await loadCookies(context, account, page, supabase);

    // 6. Navigate to creator portal
    console.log("Navigating to XHS creator portal...");
    await page.goto("https://creator.xiaohongshu.com/publish/publish", {
      waitUntil: "networkidle",
      timeout: 30000,
    });

    // Check if redirected to login
    if (page.url().includes("login") || page.url().includes("signin")) {
      console.log("Session expired. Re-doing QR login...");
      await page.goto("https://www.xiaohongshu.com", { waitUntil: "networkidle" });
      console.log("请在60秒内扫码登录小红书...");
      await page.waitForTimeout(60000);
      const freshCookies = await context.cookies();
      await supabase
        .from("xhs_accounts")
        .update({ cookies: freshCookies, status: "active" })
        .eq("id", account.id);
      await page.goto("https://creator.xiaohongshu.com/publish/publish", {
        waitUntil: "networkidle",
      });
    }

    // 7. Upload images
    console.log("Uploading carousel images...");
    const fileInput = await page.waitForSelector('input[type="file"]', { timeout: 15000 });
    if (!fileInput) throw new Error("File input not found on creator page");
    await fileInput.setInputFiles(imagePaths);

    // Wait for upload processing
    console.log("Waiting for uploads to process...");
    await page.waitForTimeout(5000);

    // 8. Fill title
    console.log("Filling title...");
    const titleSelectors = [
      'input[placeholder*="标题"]',
      'input[placeholder*="title"]',
      ".title-input input",
      "#title",
    ];
    let titleFilled = false;
    for (const sel of titleSelectors) {
      try {
        const el = await page.$(sel);
        if (el) {
          await el.click();
          await el.fill(post.title);
          titleFilled = true;
          break;
        }
      } catch { /* try next */ }
    }
    if (!titleFilled) console.warn("Could not find title input — continuing anyway");

    // 9. Fill description
    console.log("Filling description...");
    const description = post.body + "\n\n" + (post.hashtags ?? []).join(" ");
    const descSelectors = [
      'textarea[placeholder*="描述"]',
      'textarea[placeholder*="正文"]',
      'div[contenteditable="true"]',
      ".content-input textarea",
      "#content",
    ];
    let descFilled = false;
    for (const sel of descSelectors) {
      try {
        const el = await page.$(sel);
        if (el) {
          await el.click();
          await el.fill(description);
          descFilled = true;
          break;
        }
      } catch { /* try next */ }
    }
    if (!descFilled) console.warn("Could not find description input — continuing anyway");

    // 10. Try to add topic tag
    if (post.topic_tag) {
      try {
        const topicSelectors = [
          '[placeholder*="添加话题"]',
          '[placeholder*="话题"]',
          ".topic-input input",
        ];
        for (const sel of topicSelectors) {
          const el = await page.$(sel);
          if (el) {
            await el.click();
            await el.type(post.topic_tag.replace("#", ""));
            await page.waitForTimeout(1500);
            // Press first result or Enter
            await page.keyboard.press("ArrowDown");
            await page.keyboard.press("Enter");
            break;
          }
        }
      } catch (e) {
        console.warn("Could not add topic tag:", e);
      }
    }

    // Human-like delay before submitting
    const delay = 2000 + Math.floor(Math.random() * 3000);
    await page.waitForTimeout(delay);

    // 11. Click publish
    console.log("Clicking publish...");
    const publishSelectors = [
      'button:has-text("发布")',
      'button:has-text("提交")',
      ".publish-btn",
      '[data-testid="publish"]',
    ];
    let published = false;
    for (const sel of publishSelectors) {
      try {
        const btn = await page.$(sel);
        if (btn) {
          await btn.click();
          published = true;
          break;
        }
      } catch { /* try next */ }
    }
    if (!published) throw new Error("Could not find publish button");

    // 12. Wait for success
    console.log("Waiting for success redirect...");
    await page.waitForURL((url) => {
      const u = url.toString();
      return u.includes("success") || u.includes("profile") || u.includes("creator");
    }, { timeout: 30000 });

    const finalUrl = page.url();
    const postIdMatch = finalUrl.match(/\/(w{20,})/);
    const xhsPostId = postIdMatch ? postIdMatch[1] : `post_${Date.now()}`;

    console.log(`✅ Published successfully! URL: ${finalUrl}`);

    // 13. Update database
    await supabase
      .from("posts")
      .update({
        status: "published",
        xhs_post_url: finalUrl,
        xhs_post_id: xhsPostId,
      })
      .eq("id", post.id);

    await supabase
      .from("xhs_accounts")
      .update({
        posts_today: account.posts_today + 1,
        last_post_at: new Date().toISOString(),
      })
      .eq("id", account.id);

    await supabase.from("analytics").insert({ post_id: post.id });

    // 14. Save fresh cookies
    await saveCookies(context, account, supabase);

    await browser.close();
    console.log("Done.");
    process.exit(0);
  } catch (err) {
    console.error("Poster error:", err);

    let isBanned = false;
    let errorMessage = err instanceof Error ? err.message : String(err);

    // Try to detect ban from page content
    if (browser) {
      try {
        const pages = browser.contexts()[0]?.pages() ?? [];
        if (pages.length > 0) {
          const content = await pages[0].content();
          isBanned = BAN_KEYWORDS.some((kw) => content.includes(kw));
          if (isBanned) {
            errorMessage = `Account banned/restricted. Detected keywords in page content.`;
          }
        }
      } catch { /* ignore */ }
      await browser.close().catch(() => {});
    }

    if (isBanned) {
      await supabase
        .from("posts")
        .update({ status: "banned", error_message: errorMessage })
        .eq("id", post.id);

      await supabase
        .from("xhs_accounts")
        .update({ status: "banned" })
        .eq("id", account.id);

      console.error("Account banned. Marked in database.");
    } else {
      await supabase
        .from("posts")
        .update({
          status: "failed",
          error_message: errorMessage,
          retry_count: (post.retry_count ?? 0) + 1,
        })
        .eq("id", post.id);
    }

    process.exit(1);
  }
}

main();