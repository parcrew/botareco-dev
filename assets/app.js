/* =========================================================
 * Leafla / app.js  v1.4  (OpenAI/Gemini 切替・候補表示・残回数再読)
 * - 無料: 名称のみ（3回/日）
 * - 会員: 名称+所見（50回/日）
 * - analyze: Supabase Edge Functions
 *   - Gemini版:   /analyze   （既存）
 *   - OpenAI版:   /analyze-oai  （?engine=oai で使用）
 * - 候補(Top-K)表示、notes表示、NaN対策、解析後に /limits 再読
 * ======================================================= */

/* ====== Supabase Edge Functions のベースURL ====== */
const API_BASE = "https://laixgcjvowdszrtdpxlq.functions.supabase.co";
const ENDPOINT = {
  limits: `${API_BASE}/limits`,
  analyze: `${API_BASE}/analyze`,
  analyzeOAI: `${API_BASE}/analyze-oai`,
};
const USE_OAI = location.search.includes("engine=oai"); // ?engine=oai で OpenAI 版に切替

/* ====== 小ユーティリティ ====== */
const q = (sel) => document.querySelector(sel);
const html = (el, s) => (el.innerHTML = s);
const safe = (v, d = "") => (v === undefined || v === null ? d : v);

/** 0..1 の信頼度を % 文字列に。数値でないときは空文字 */
function formatPercent01(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return "";
  const pct = Math.round(n * 100);
  return `${pct}%`;
}

/** 送信中ボタンUIの制御 */
function withBusy(btn, fn) {
  return async (...args) => {
    try {
      btn.disabled = true;
      btn.dataset.originalText = btn.textContent;
      btn.textContent = "処理中…";
      return await fn(...args);
    } finally {
      btn.textContent = btn.dataset.originalText || "実行";
      btn.disabled = false;
    }
  };
}

/* ====== アプリ本体 ====== */
document.addEventListener("DOMContentLoaded", () => {
  const root = document.getElementById("leaflabot-root");
  if (!root) return;

  const S = window.LEAFLA || {};         // layout側から埋め込まれる
  const ent = S.entitlement || null;      // 会員情報スナップショット

  const view = (s) => html(root, s);
  const dailyRemain = (e) =>
    Math.max(0, (e.daily_limit - (e.daily_used || 0)) + (e.topup_remaining || 0));

  /* ---------- 非会員ビュー ---------- */
  if (!S.isLoggedIn || !ent) {
    view(`
      <section style="max-width:720px;margin:32px auto;padding:16px;">
        <h2>Leafla（無料プラン）</h2>
        <p>1日3回まで植物名を判定できます。保存・所見は有料会員でご利用いただけます。</p>
        <div style="margin-top:16px;">
          <button id="btn-start">はじめる</button>
        </div>
        <div id="lf-area" style="margin-top:16px;"></div>
      </section>
    `);
    bindGuest();
    return;
  }

  /* ---------- 会員ビュー ---------- */
  const remain = dailyRemain(ent);
  view(`
    <section style="max-width:720px;margin:32px auto;padding:16px;">
      <h2>Leafla（会員）</h2>
      <p>こんにちは、${S.customerEmail || "会員"} さん。</p>
      <p>本日の残り回数：<strong id="lf-remain">${remain}</strong> / ${ent.daily_limit}（+ 追加 ${ent.topup_remaining || 0}）</p>
      <div style="margin:16px 0;">
        <button id="btn-upload">写真から判定</button>
        <button id="btn-list">育成記録を見る</button>
      </div>
      <div id="lf-area" style="margin-top:16px;"></div>
    </section>
  `);
  bindMember(ent);

  /* ================= ハンドラ群 ================= */

  function bindGuest() {
    const area = q("#lf-area");
    const btn = q("#btn-start");
    btn.addEventListener(
      "click",
      withBusy(btn, async () => {
        const ok = await checkLimits("free");
        if (!ok) {
          area.innerHTML = limitReachedHTML(false);
          return;
        }
        await pickAndAnalyze(area, "free");
      }),
    );
  }

  function bindMember(ent) {
    const area = q("#lf-area");
    const btnUp = q("#btn-upload");
    btnUp.addEventListener(
      "click",
      withBusy(btnUp, async () => {
        const ok = await checkLimits("member");
        if (!ok) {
          area.innerHTML = limitReachedHTML(true);
          return;
        }
        await pickAndAnalyze(area, "member");
      }),
    );

    const btnList = q("#btn-list");
    btnList.addEventListener("click", () => {
      area.innerHTML = `<p>育成記録一覧（/api/plants を後で実装）</p>`;
    });
  }

  /** サーバ原本の当日上限チェック */
  async function checkLimits(role) {
    try {
      const r = await fetch(ENDPOINT.limits, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: S.customerEmail || null,
          role, // "free" | "member"
        }),
      });
      const data = await r.json().catch(() => null);
      return data && data.allow === true;
    } catch (e) {
      console.error("limits.error", e);
      return false;
    }
  }

  function limitReachedHTML(isMember = false) {
    return isMember
      ? `<p>本日の上限に達しました。明日お試しください。追加回数（10回=100円）をご購入いただくとすぐに使えます。</p>`
      : `<p>本日の無料上限（3回）に達しました。会員登録で保存や所見が使えます。</p>`;
  }

  /** 解析後に /limits を再読して残回数UIを更新 */
  async function updateRemainByLimits(role, email) {
    try {
      const r = await fetch(ENDPOINT.limits, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, email: email || null })
      });
      const j = await r.json().catch(()=>null);
      if (j && typeof j.used === "number" && typeof j.limit === "number") {
        const el = document.querySelector("#lf-remain");
        if (el) el.textContent = String(Math.max(0, j.limit - j.used));
      }
    } catch {}
  }

  /** 画像選択→/analyze へ送信→結果表示 */
  async function pickAndAnalyze(area, role) {
    // 画像選択
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";

    input.onchange = async () => {
      const file = input.files && input.files[0];
      if (!file) return;

      // クライアント側の軽い前検証（任意）
      if (!/^image\/(jpe?g|png|webp)$/i.test(file.type || "")) {
        area.innerHTML = `<p>対応していない画像形式です（jpg/png/webp）。</p>`;
        return;
      }
      if (file.size > 8 * 1024 * 1024) {
        area.innerHTML = `<p>画像が大きすぎます（最大 8MB）。</p>`;
        return;
      }

      // プレビュー（任意）
      const url = URL.createObjectURL(file);
      area.innerHTML = `
        <div style="margin-bottom:8px;">解析中…</div>
        <img src="${url}" alt="preview" style="max-width:100%;border:1px solid #eee;border-radius:8px;" />
      `;

      try {
        const fd = new FormData();
        fd.append("image", file);
        fd.append("email", S.customerEmail || "");
        fd.append("role", role);

        const ep = USE_OAI ? ENDPOINT.analyzeOAI : ENDPOINT.analyze;
        const r = await fetch(ep, { method: 'POST', body: fd });
        const data = await r.json();

        // エラーハンドリング
        if (data?.error) {
          area.innerHTML = `<p>エラーが発生しました：${safe(data.error, "unknown")}</p>`;
          await updateRemainByLimits(role, S.customerEmail || null);
          return;
        }

        // 非植物（ゲート除外）
        if (data?.notPlant) {
          area.innerHTML = `<p>${safe(data.message, "植物が写っていないようです。葉を中心に撮影してください。")}</p>`;
          await updateRemainByLimits(role, S.customerEmail || null);
          return;
        }

        // 表示用（NaN対策）
        const label = safe(data.label, "植物（特定中）");
        const pctStr = formatPercent01(data.confidence); // "" なら表示しない

        // 候補とメモ（ある場合のみ）
        const candidatesHtml = Array.isArray(data.candidates) && data.candidates.length
          ? `<div style="margin-top:12px">
               <div style="font-weight:bold;margin-bottom:6px;">候補（確信度順）</div>
               <ol style="padding-left:20px;">
                 ${data.candidates.map(c => {
                    const name = (c.label || c.sci_name || '').trim() || '（名称不明）';
                    const pct  = Number.isFinite(c.confidence) ? Math.round(c.confidence*100) + '%' : '';
                    return `<li>${name}${pct ? `（${pct}）` : ''}</li>`;
                  }).join('')}
               </ol>
             </div>`
          : '';
        const notesHtml = data.notes
          ? `<p style="margin-top:8px;color:#555">特徴メモ：${data.notes}</p>`
          : '';

        if (role === "free") {
          area.innerHTML = `
            <div>
              <p>推定：<strong>${label}</strong>${pctStr ? `（${pctStr}）` : ""}</p>
              ${notesHtml}
              ${candidatesHtml}
              <p>保存や育成アドバイスは会員登録でご利用いただけます。</p>
            </div>`;
        } else {
          // 会員向け所見
          const a = data.assessment || {};
          area.innerHTML = `
            <div>
              <p>推定：<strong>${label}</strong>${pctStr ? `（${pctStr}）` : ""}</p>
              ${data.uncertain ? `<p>※ 種類特定の確信度が低い結果です。葉に近づいて再撮影してください。</p>` : ""}
              ${notesHtml}
              <div>
                <h3 style="margin:12px 0 8px;">所見</h3>
                <ul style="padding-left:20px;">
                  <li>健康：${safe(a.health, "-")}</li>
                  <li>成長部位：${safe(a.growth, "-")}</li>
                  <li>病気の可能性：${safe(a.disease, "-")}</li>
                  <li>次アクション：${safe(a.next, "-")}</li>
                </ul>
              </div>
              ${candidatesHtml}
              <!-- TODO: 保存ボタン（/api/entries へ） -->
            </div>`;
        }

        await updateRemainByLimits(role, S.customerEmail || null);
      } catch (e) {
        console.error("analyze.error", e);
        area.innerHTML = `<p>通信中にエラーが発生しました。時間をおいて再実行してください。</p>`;
        await updateRemainByLimits(role, S.customerEmail || null);
      }
    };

    input.click();
  }
});
