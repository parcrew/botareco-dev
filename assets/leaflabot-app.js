// LEAFLA植物育成記録システム 完全統合版 JavaScript
// v6.6.0ベース + TypeScript v17.1.0完全対応版 - 構文エラー修正版
// 全機能統合・nano-banana画像生成対応・ケア管理完全実装
const nativeFetch = globalThis.fetch.bind(globalThis);

class PlantConsultationApp {
constructor() {
    // 基本設定
    this.userEmail = window.LEAFLA?.customerEmail || window.LEAFLA?.customer?.email || '';
    this.isLoggedIn = window.LEAFLA?.isLoggedIn || false;
    this.SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxhaXhnY2p2b3dkc3pydGRweGxxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU2NTM5MTIsImV4cCI6MjA2MTIyOTkxMn0.yAvMili-p_uQMHYlz-fpErgFqX243J5z1zI87VqO63M';
    this.entitlement = window.LEAFLA?.entitlement || null;
    this.currentQuota = null;
    this.entitlementSnapshot = window.LEAFLA?.entitlement_snapshot || null;
    
    // API設定
    this.apiBase = 'https://laixgcjvowdszrtdpxlq.supabase.co/functions/v1/process-consultation';

    // 状態管理
    this.existingPlants = [];
    this.lastSelectedPlant = null;
    this.currentOpenThread = null;
    this.seasonInfo = this.getCurrentSeasonInfo();
    
    // TypeScript v17.1.0準拠のケア種別定義
    this.careTypes = {
      watering: { 
        icon: '💧', 
        name: '水やり', 
        base_interval_days: 7, 
        seasonal_multipliers: { spring: 0.8, summer: 0.6, autumn: 1.0, winter: 1.5 } 
      },
      fertilizing: { 
        icon: '🌱', 
        name: '肥料', 
        base_interval_days: 30, 
        seasonal_multipliers: { spring: 0.8, summer: 0.9, autumn: 1.2, winter: 2.0 } 
      },
      repotting: { 
        icon: '🪴', 
        name: '植え替え', 
        base_interval_days: 365, 
        seasonal_multipliers: { spring: 1.0, summer: 1.1, autumn: 1.0, winter: 1.3 } 
      },
      pruning: { 
        icon: '✂️', 
        name: '剪定', 
        base_interval_days: 90, 
        seasonal_multipliers: { spring: 0.8, summer: 1.0, autumn: 0.9, winter: 1.5 } 
      },
      pest_control: { 
        icon: '🐛', 
        name: '害虫対策', 
        base_interval_days: 14, 
        seasonal_multipliers: { spring: 0.8, summer: 0.7, autumn: 1.0, winter: 1.8 } 
      },
      other: { 
        icon: '📝', 
        name: 'その他', 
        base_interval_days: 30, 
        seasonal_multipliers: { spring: 1.0, summer: 1.0, autumn: 1.0, winter: 1.0 } 
      }
    };
    
    // クォータ情報のキャッシュ
    this._quotaCache = null;
    this._quotaCacheExpiry = 0;
    this._quotaLoading = false;
    
    // 送信制限
    this._lastSubmitTime = 0;
    this._minSubmitInterval = 30000; // 30秒
    
  // SNS状態管理を初期化（最後に追加）
  this.snsState = {
    currentSort: 'recent',
    currentPage: 1,
    hasMore: true,
    posts: []
  };
    this.init();

  this.openedFromSNS = false;
  this.returnToPostDetail = false;
  this.currentPostId = null;
  }
requestServerIllustration(...args) {
  return this.requestServerIllustrationPatch(...args);
}
  init() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.start());
    } else {
      this.start();
    }
  }

async start() {
  console.log('🚀🚀🚀 START関数実行開始（新バージョン）🚀🚀🚀');
  console.log('タイムスタンプ:', new Date().toISOString());
  console.log('ログイン状態:', this.isLoggedIn);
  console.log('ユーザーメール:', this.userEmail);
  console.log('entitlement:', this.entitlement);
  
  console.log('LEAFLA植物育成記録アプリ 完全統合版 初期化開始');
  
  this.renderApp();
  this.attachEventListeners();
  
  const membershipType = this.getMembershipType();
  console.log('start() 実行時の会員種別:', membershipType);
  
  if (this.isLoggedIn && membershipType !== 'non_member') {
    console.log('✅ 無料/有料会員として処理開始');
    
    // UIは先に表示
    const container = document.getElementById('threads-list');
    if (container) {
      container.innerHTML = '<div class="loading">植物記録を読み込み中...</div>';
    }
    
    // データ取得（非ブロッキング）
    this.loadExistingPlantsForSelection()
      .then(() => {
        console.log('🌱 植物データ取得完了:', this.existingPlants.length);
        if (container && this.existingPlants.length > 0) {
          this.renderThreadsList(this.existingPlants, membershipType);
        } else if (container) {
          this.renderThreadsList([], membershipType);
        }
      })
      .catch(error => {
        console.error('❌ 植物データ取得エラー:', error);
      });
    
    // 統計とクオータは後から読み込む（非ブロッキング）
    setTimeout(() => {
      this.loadHeaderStats();
      this.loadQuotaInfo();
    }, 100);
    
} else if (this.isLoggedIn) {
  console.log('非会員ユーザー: 体験版として動作');
  setTimeout(() => this.loadQuotaInfo(), 100);
}

await this.syncShopifyPacks();
// ★★★ 新ヘッダー初期化を追加 ★★★
this.initNewHeader();

  // ★★★ 一番最後に追加 ★★★
  if (window.location.hash === '#sns') {
    setTimeout(() => {
      this.openSNSFeed();
    }, 300);
  }

}  // ← start() メソッドの終わり

getMembershipType() {
  /*
  if (!this.isLoggedIn) return 'non_member';
  */
  if (!this.userEmail) {
    return 'non_member';
  }
  
  // entitlement があり、有効な有料プラン
  if (this.entitlement) {
    const validStatuses = ['active', 'grace_period'];
    if (validStatuses.includes(this.entitlement.status)) {
      const paidPlans = ['member', 'premium', 'basic-monthly', 'pro-monthly', '1months', '6months', '12months'];
      if (paidPlans.includes(this.entitlement.plan_code)) {
        return 'paid_member';
      }
    }
  }
  
  // ログイン済みだが有料プランでない → 無料会員
  return 'free_member';
}

async syncShopifyPacks() {
  if (!this.userEmail || this.userEmail.startsWith('anon_') || this.userEmail.startsWith('fp_')) {
    return;
  }

  try {
    var response = await fetch(
      this.apiBase + '?action=sync_shopify_packs',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_email: this.userEmail
        })
      }
    );

    if (response.ok) {
      var data = await response.json();
      if (data.success && (data.consultation.purchased > 0 || data.illustration.purchased > 0)) {
        console.log('✅ Shopify購入反映:', data);
        this.loadQuotaInfo(true);  // ★ 強制再読み込み
      }
    }
  } catch (error) {
    console.log('Shopify同期スキップ:', error);
  }
}
getAnonymousId() {
  const storageKey = 'leafla_anonymous_id';
  let anonymousId = localStorage.getItem(storageKey);
  if (!anonymousId) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    anonymousId = `anon_${timestamp}_${random}`;
    localStorage.setItem(storageKey, anonymousId);
    console.log('🆔 新規匿名ID生成:', anonymousId);
  }
  return anonymousId;
}
// ★★★ 新規メソッド追加 ★★★
getBrowserFingerprint() {
  try {
    // Canvas fingerprint（最も有効な識別方法）
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillStyle = '#f60';
    ctx.fillRect(0, 0, 100, 30);
    ctx.fillStyle = '#069';
    ctx.fillText('LEAFLA 🌱', 2, 2);
    const canvasData = canvas.toDataURL();
    
    // デバイス情報を収集
    const fingerprint = {
      canvas: canvasData.substring(0, 150),
      screen: `${screen.width}x${screen.height}x${screen.colorDepth}`,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      language: navigator.language,
      platform: navigator.platform,
      cores: navigator.hardwareConcurrency || 0
    };
    
    // ハッシュ化（簡易版）
    const str = JSON.stringify(fingerprint);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    
    const fp = 'fp_' + Math.abs(hash).toString(36);
    console.log('🔍 ブラウザフィンガープリント生成:', fp);
    return fp;
    
  } catch (error) {
    console.error('フィンガープリント生成エラー:', error);
    return null;
  }
}


// ← 既存の applyQuotaFromResponse を丸ごと置換してください
applyQuotaFromResponse(resp) {
  console.log('quota response受信:', resp);
  const consultQuota = resp.consultation_quota;
  const hasQuotaPayload = !!(resp && (
    'plant_count' in resp ||
    'consultation_quota' in resp ||
    'illustration_quota' in resp
  ));
  if (!hasQuotaPayload) {
    console.log('quota系でないレスポンスのためスキップ');
    return;
  }

  const el = document.getElementById('quota-display');
  if (!el) return;

  const membershipType = this.getMembershipType();
  let quotaHtml = '';
  const actualPlantCount = this.existingPlants?.length ?? (resp.plant_count ?? 0);

  if (membershipType === 'paid_member') {
    quotaHtml = `有料会員: 植物${actualPlantCount}/50個`;

    // === 相談クオータ表示（サーバーデータを信頼） ===
    const consultQuota = resp.consultation_quota;  // ← ★★★ この行を追加 ★★★
  
    if (consultQuota) {
      console.log('🔍 サーバーから受信したconsultation_quota:', consultQuota);
      
      const used = consultQuota.used || 0;
      const baseLimit = consultQuota.base_limit || consultQuota.limit || 150;
      const additionalPacks = consultQuota.additional_packs || 0;
      
      // デフォルト枠の使用状況
      const defaultUsed = Math.min(used, baseLimit);
      const defaultRemaining = Math.max(0, baseLimit - used);
      
      // 追加パック使用数（デフォルト枠を超えた分）
      const packUnit = consultQuota.pack_unit || 100;
      const totalPackQuota = additionalPacks * packUnit;
      const packsUsed = Math.max(0, used - baseLimit);
      const packsRemaining = Math.max(0, totalPackQuota - packsUsed);
      
      // 合計残数
      const totalRemaining = defaultRemaining + packsRemaining;
      const totalLimit = baseLimit + totalPackQuota;
      
      // 表示クラス判定
      const remainingPercent = totalLimit > 0 
        ? Math.round((totalRemaining / totalLimit) * 100)
        : 0;
      const consultClass = remainingPercent < 20 ? 'quota-warning'
                        : remainingPercent < 50 ? 'quota-caution'
                        : 'quota-normal';
      
      console.log('📊 相談クオータ計算:', {
        used, baseLimit, additionalPacks, packUnit,
        totalPackQuota, totalLimit, totalRemaining
      });
      
      // 表示HTML生成
      if (additionalPacks > 0) {
        quotaHtml += `<br>相談: <span class="${consultClass}">${used}/${totalLimit}</span> <small>（今月残り${totalRemaining}回）</small>`;
        quotaHtml += `<br><small>└ デフォルト: ${defaultUsed}/${baseLimit} | 追加パック: ${additionalPacks}個残（${packsRemaining}回分）</small>`;
      } else {
        quotaHtml += `<br>相談: <span class="${consultClass}">${used}/${baseLimit}</span> <small>（今月残り${defaultRemaining}回）</small>`;
      }
    }

    // === イラストクオータ表示（サーバーデータを信頼） ===
    const illustQuota = resp.illustration_quota;  // ← boostなし！
    if (illustQuota) {
      const used = illustQuota.used || 0;
      const baseLimit = illustQuota.base_limit || illustQuota.limit || 20;
      const additionalPacks = illustQuota.additional_packs || 0;
      
      const defaultUsed = Math.min(used, baseLimit);
      const defaultRemaining = Math.max(0, baseLimit - used);
      
      const packUnit = illustQuota.pack_unit || 50;
      const totalPackQuota = additionalPacks * packUnit;
      const packsUsed = Math.max(0, used - baseLimit);
      const packsRemaining = Math.max(0, totalPackQuota - packsUsed);
      
      const totalRemaining = defaultRemaining + packsRemaining;
      const totalLimit = baseLimit + totalPackQuota;
      
      const remainingPercent = totalLimit > 0
        ? Math.round((totalRemaining / totalLimit) * 100)
        : 0;
      const illusClass = remainingPercent < 20 ? 'quota-warning'
                      : remainingPercent < 50 ? 'quota-caution'
                      : 'quota-normal';
      
      if (additionalPacks > 0) {
        quotaHtml += `<br>イラスト: <span class="${illusClass}">${used}/${totalLimit}</span> <small>（今月残り${totalRemaining}回）</small>`;
        quotaHtml += `<br><small>└ デフォルト: ${defaultUsed}/${baseLimit} | 追加パック: ${additionalPacks}個残（${packsRemaining}回分）</small>`;
      } else {
        quotaHtml += `<br>イラスト: <span class="${illusClass}">${used}/${baseLimit}</span> <small>（今月残り${defaultRemaining}回）</small>`;
      }
    }

  } else if (membershipType === 'free_member') {
    const upgradeLink = actualPlantCount >= 15 ? 
      '<br><small><a href="/products/leafla-subscription" style="color: #7c3aed;">有料プランで50個まで拡張 →</a></small>' : '';
    
    quotaHtml = `無料会員: 植物${actualPlantCount}/20個${upgradeLink}<br><small>AI相談・イラスト生成は有料会員限定</small>`;
  } else {
    quotaHtml = `<span>体験版: 制限あり | <a href="/account/register" style="color: #059669; text-decoration: underline;">無料登録で記録保存</a></span>`;
  }

  el.innerHTML = quotaHtml;
  console.log('✅ quota表示更新完了:', quotaHtml);
}



  getCurrentSeasonInfo() {
    const now = new Date();
    const month = now.getMonth() + 1;
    
    let season, seasonName, seasonEmoji;
    
    if (month >= 3 && month <= 5) {
      season = 'spring';
      seasonName = '春';
      seasonEmoji = '🌸';
    } else if (month >= 6 && month <= 8) {
      season = 'summer';
      seasonName = '夏';
      seasonEmoji = '☀️';
    } else if (month >= 9 && month <= 11) {
      season = 'autumn';
      seasonName = '秋';
      seasonEmoji = '🍂';
    } else {
      season = 'winter';
      seasonName = '冬';
      seasonEmoji = '❄️';
    }
    
    return {
      season,
      seasonName,
      seasonEmoji,
      displayText: `${seasonEmoji} ${seasonName}`,
      month,
      careMultipliers: this.getSeasonalCareMultipliers(season)
    };
  }

  getSeasonalCareMultipliers(season) {
    const multipliers = {
      spring: { watering: 0.8, fertilizing: 0.7, repotting: 0.9, pruning: 0.8, pest_control: 0.9 },
      summer: { watering: 0.6, fertilizing: 0.8, repotting: 1.5, pruning: 1.2, pest_control: 0.7 },
      autumn: { watering: 1.0, fertilizing: 1.0, repotting: 0.8, pruning: 0.9, pest_control: 1.0 },
      winter: { watering: 1.5, fertilizing: 2.0, repotting: 2.0, pruning: 1.5, pest_control: 1.3 }
    };
    
    return multipliers[season] || multipliers.autumn;
  }

  getSeasonalCareInterval(careType, season = null) {
    const currentSeason = season || this.seasonInfo.season;
    const careConfig = this.careTypes[careType];
    if (!careConfig) return 30;
    
    const baseInterval = careConfig.base_interval_days;
    const multiplier = careConfig.seasonal_multipliers[currentSeason] || 1.0;
    return Math.round(baseInterval * multiplier);
  }
// --- 追加: 日本語・英語混在文の軽量正規化 ---
normalizeJP(text = '') {
  return (text || '')
    .toLowerCase()
    .replace(/[（）]/g,'(')               // 全角カッコ→半角
    .replace(/[－―ーｰ]/g,'-')             // 長音・ダッシュ統一
    .replace(/[・･]/g,' ')                 // 中点トリム
    .replace(/\s+/g,' ')
    .trim();
}

// --- 追加: 植物タイプ推定（幅広め） ---
identifyPlantType(plantName = '') {
  const name = this.normalizeJP(plantName);
  if (/(ビカク|ビフルカツム|リドレイ|staghorn)/.test(name)) return 'staghorn_fern';
  if (/(多肉|アガベ|ハオルチア|エケベリア|サボテン|柱|烏羽玉|ロフォ|アストロ)/.test(name)) return 'succulent_cacti';
  if (/(塊根|コーデックス|アデニウム|パキポ|オトンナ|亀甲竜)/.test(name)) return 'caudex';
  if (/(シダ|fern|プテリス|ネフロ|アジアンタム)/.test(name)) return 'fern';
  if (/(ポトス|モンステラ|フィロデンドロン|アンスリウム|ドラセナ|観葉)/.test(name)) return 'foliage';
  if (/(蘭|ラン|phalaenopsis|セッコク|オンシ|カトレア)/.test(name)) return 'orchid';
  if (/(トマト|トウガラシ|レタス|バジル|ハーブ|家庭菜園|野菜|果樹|柑橘)/.test(name)) return 'edible';
  if (/(ドライフラワー|生花|切り花|bouquet|wreath)/.test(name)) return 'cut_or_dry';
  return 'general';
}
// ★追加：テキストから強制シーンを抽出（全シーン対応）
getForcedSceneFromText(text = '') {
  const t = (text || '').toLowerCase();
  const map = [
    { re: /子株|仔株|カキ子|pup|offset|sucker/, scene: 'pup_separation' },
    { re: /株分け|division/,                      scene: 'division' },
    { re: /植え替え|鉢替え|鉢増し|用土|根鉢/,      scene: 'repotting' },
    { re: /腰水|bottom[\s-]*water/,                scene: 'bottom_watering' },
    { re: /水やり|潅水|給水|watering/,             scene: 'watering' },
    { re: /害虫|カイガラムシ|ハダニ|薬剤|殺虫/,      scene: 'pest_control' },
    { re: /挿し木|挿し芽|胴切り|cutting|graft/,     scene: 'cutting' },
    { re: /取り木|エアレイヤ/,                     scene: 'air_layering' },
    { re: /板付|着生|mount/,                       scene: 'mounting' },
    { re: /支柱|誘引|整枝|stake|training/,          scene: 'staking_training' },
    { re: /葉水|misting|霧吹き/,                    scene: 'misting' }
  ];
  const hit = map.find(m => m.re.test(t));
  return hit ? hit.scene : null;
}

// --- 追加: シーン分類（方向性を確定） ---
classifyScene({ plantName='', consultationRequest='', notes='', aiResponse='' }) {
  const t = this.normalizeJP(`${plantName} ${consultationRequest} ${notes} ${aiResponse}`);

  const KW = {
    mounting: /(板付|板付け|着生|ボード|着生板|mount(ing)?)/,
    watering: /(水やり|潅水|腰水|bottom\s*water|霧吹き|葉水)/,
    repotting: /(植え替え|鉢増し|用土|土替え|鉢替え|根鉢|鉢上げ|鉢下ろし)/,
    division: /(株分け|分け|分株|division)/,
    pup: /(子株|仔株|カキ子|オフセット|pup|offset|sucker)/,
    cutting: /(挿し木|挿し芽|胴切り|接ぎ木|cutting|graft)/,
    air_layer: /(取り木|エアレイヤリング|air[\s-]*layer)/,
    pest: /(害虫|カイガラムシ|ハダニ|コナジラミ|アブラムシ|薬剤|殺虫|ベニカ|オルトラン)/,
    staking: /(支柱|誘引|整枝|tie|stake|training)/,
    misting: /(葉水|misting|spray)/,
    bottom_watering: /(腰水|bottom[\s-]*water)/,
    diagnosis_only: /(原因|症状|大丈夫|心配|診断|状態|枯|黒点|斑点|病気|対処|なぜ)/
  };

  const scores = {
    mounting: +KW.mounting.test(t),
    watering: +KW.watering.test(t),
    repotting: +KW.repotting.test(t),
    division: +KW.division.test(t),
    pup: +KW.pup.test(t) * 2, // 「子株」は最優先
    cutting: +KW.cutting.test(t),
    air_layer: +KW.air_layer.test(t),
    pest: +KW.pest.test(t),
    staking: +KW.staking.test(t),
    misting: +KW.misting.test(t),
    bottom_watering: +KW.bottom_watering.test(t)
  };

  if (scores.pup) scores.division += 1; // 子株→分離/株分けと親和

  const entries = Object.entries(scores).sort((a,b)=>b[1]-a[1]);
  const [topScene, topScore] = entries[0] || ['general_care', 0];

  const diagnosisOnly = KW.diagnosis_only.test(t) && topScore === 0;

  const confidence = Math.min(1, topScore / 2);

  const map = {
    mounting: 'mounting',
    watering: 'watering',
    repotting: 'repotting',
    division: 'division',
    pup: 'pup_separation',
    cutting: 'cutting',
    air_layer: 'air_layering',
    pest: 'pest_control',
    staking: 'staking_training',
    misting: 'misting',
    bottom_watering: 'bottom_watering'
  };

  return {
    scene: topScore > 0 ? (map[topScene] || 'general_care') : 'general_care',
    confidence,
    diagnosisOnly,
    plantType: this.identifyPlantType(plantName)
  };
}

shouldGenerateIllustration(consultationRequest, notes, plantType, aiResponse) {
  if (this.getMembershipType() !== 'paid_member') return false;
  if (!window.LEAFLA?.features?.text_free_illustration) return false;
  if (!aiResponse || aiResponse.length < 10) return false;

  const ar = (aiResponse || '').toLowerCase();
  if (
    plantType === 'non_plant' ||
    /植物の名前ではない|非植物|not\s+a\s+plant|no\s+plant/.test(ar)
  ) return false;

  // 強制シーンが拾えたら優先許可
const forced = this.getForcedSceneFromText(`${consultationRequest} ${notes}`);
if (forced) return true;

  const { confidence, diagnosisOnly } = this.classifyScene({
    plantName: document.getElementById('plant-name')?.value || '',
    consultationRequest, notes, aiResponse
  });
  if (diagnosisOnly) return false;

  return confidence >= 0.3;
}


/*
async generateTextFreeIllustration({ plantName, scene, plantType, apiKey }) {
  try {
    const toolsByScene = {
      mounting: 'wooden board, sphagnum moss, twine/string, scissors',
      watering: 'watering can, drip technique, moisture check',
      repotting: 'pot, soil, scoop, gloves, tapping pot',
      division: 'knife, clean cut, root tease, separate clumps',
      pup_separation: 'sterile knife, separate pup from parent, healing time',
      cutting: 'pruners, node cut, rooting medium',
      air_layering: 'sphagnum moss, wrap, tie, cut after rooting',
      pest_control: 'spray bottle, soft brush, wipe leaves',
      staking_training: 'stake, soft tie, gentle support',
      misting: 'fine mist sprayer, leaf-only spray',
      bottom_watering: 'tray of water, capillary action',
      general_care: 'hands, simple tools'
    };

    const sceneKey = toolsByScene[scene] ? scene : 'general_care';
    const palette = 'sage green, warm browns, soft whites';

const prompt = `
この写真のアガベ（${plantName}）の子株分離方法を教育的イラストで表現してください。

植物の特徴:
- 厚い三角形の葉が放射状に配置されたロゼット
- 葉の縁と先端に鋭い棘
- 青緑色で粉を吹いたような質感
- 基部から小さな子株が発生

イラスト内容:
- しっかりと根出している子株
- 清潔なナイフでの切り離し手順
- 切り離した子株の様子
- 新しい鉢への植え付け

スタイル: 日本の園芸書風の教育的イラスト
色調: 自然な緑色、温かい茶色の土、清潔感
文字は一切含めない
`;

const payload = {
  contents: [{ parts: [{ text: prompt }]}],
  generationConfig: {
    responseModalities: ["IMAGE"],
    temperature: 1.0,
    topK: 40,
    topP: 0.95,
    maxOutputTokens: 8192
  }
};

    const res = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(payload)
      }
    );
    if (!res.ok) return null;

    const data = await res.json();
    const parts = data?.candidates?.[0]?.content?.parts || [];
    const b64 = parts.find(p => p?.inline_data?.data)?.inline_data?.data
             || parts.find(p => p?.inlineData?.data)?.inlineData?.data
             || null;
    if (!b64) return null;
    return { imageData: b64, sceneType: sceneKey };
  } catch (e) {
    console.error('イラスト生成エラー:', e);
    return null;
  }
}
*/

// 既存の関数を以下で置き換え
// === BEGIN PATCH: requestServerIllustrationPatch (完全置換) ===
async requestServerIllustrationPatch({
  plantName,
  scene,                 // 未使用でも残してOK
  plantType,             // 未使用でも残してOK
  postId = null,
  threadId = null,
  aiResponse = '',
  consultationRequest = '',
  notes = ''
}) {
  try {
    console.log('=== イラスト生成開始 ===');

    const membershipType = this.getMembershipType();
    if (membershipType !== 'paid_member') {
      console.log('非有料会員のため処理停止');
      this.showTemporaryNotification?.('イラスト生成は有料会員限定機能です', 'error');
      return null;
    }

    const payload = {
      user_email: this.userEmail || '',
      entitlement: this.entitlement || null,
      entitlement_snapshot: this.entitlementSnapshot || null,
      plant_name: plantName || '植物',
      consultation_request: consultationRequest || '',
      notes: notes || '',
      ai_response: aiResponse || '',
      // ★ これが無いとサーバ側でどの投稿に紐づけるか分からない
      post_id: postId ?? null,
      existing_thread_id: threadId ?? null
    };

    const res = await fetch(`${this.apiBase}?action=generate_illustration`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json().catch(()=> ({}));

    if (!res.ok) {
      if (data?.error === 'illustration_limit_reached') {
        this.showIllustrationLimitModal?.(data);
        return null;
      }
      console.error('API エラー:', data);
      this.showTemporaryNotification?.('イラスト生成に失敗しました', 'error');
      return null;
    }

    if (data.success && data.ai_generated_image_url) {
      console.log('イラスト生成成功:', data.ai_generated_image_url);
      this.loadQuotaInfo?.();
      return data.ai_generated_image_url;
    }

    return null;
  } catch (error) {
    console.error('イラスト生成例外:', error);
    this.showTemporaryNotification?.('イラスト生成で例外が発生しました', 'error');
    return null;
  }
}
// === END PATCH ===


  generateSecureUserId(userEmail) {
    if (!userEmail) return 'anonymous';
    const encoder = new TextEncoder();
    const data = encoder.encode(userEmail + 'LEAFLA_SALT_2024');
    let hash = 0;
    for(let i = 0; i < data.length; i++){
      const char = data[i];
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36).substring(0, 8);
  }

  renderApp() {
    const container = document.getElementById('leaflabot-root');
    if (!container) {
      console.error('leaflabot-root container not found');
      return;
    }

    container.innerHTML = `
      <div class="plant-consultation-container">
        ${this.renderHeader()}
        ${this.renderMainContent()}
      </div>
    `;
  }

renderHeader() {
  if (!this.isLoggedIn) {
    return `<div class="br-guest-hero">
  <div class="br-guest-hero-card">
    <div class="br-guest-hero-illu">
      <img src="https://cdn.shopify.com/s/files/1/0658/5332/5495/files/il1.png?v=1765080460" alt="植物ケアのイメージ">
    </div>
    <div class="br-guest-hero-body">
      <h2 class="br-guest-hero-title">植物育成記録・相談サービス</h2>
      <p class="br-guest-hero-copy">植物の成長を記録し、AIがケア状態を解析します。</p>
      <p class="br-guest-hero-copy">ログインすると、育成記録の保存やケア相談が利用できます。</p>
      <div class="br-guest-hero-cta">
        <a href="/customer_authentication/login?return_to=${encodeURIComponent(window.location.pathname + window.location.search || '/pages/botareco')}" class="br-guest-btn primary">ログイン</a>
        <a href="/customer_authentication/login?return_to=${encodeURIComponent(window.location.pathname + window.location.search || '/pages/botareco')}" class="br-guest-btn secondary">新規会員登録</a>
     </div>
    </div>
  </div>
</div>`;
  }

  const membershipType = this.getMembershipType();
  const membershipLabels = {
    non_member: '非会員',
    free_member: '無料会員', 
    paid_member: '有料会員'
  };

  return `<div class="app-header">
      <h2>BotaReco（ボタレコ）<br>植物管理カレンダーと育成・栽培記録アプリ</h2>
      
      ${this.renderHeaderStats(membershipType)}
      
      <div class="user-info">
        <span>ようこそ、${window.LEAFLA?.customer?.first_name || 'お客様'}さん</span>
        <div class="membership-info">
          <span class="plan-badge plan-${membershipType}">${membershipLabels[membershipType]}</span>
          ${membershipType !== 'paid_member' ? '<a href="/products/leafla-subscription" style="margin-left: 10px; font-size: 12px; color: #2563eb;">アップグレード</a>' : ''}
        </div>
        <div class="season-info">
          <span class="season-badge">${this.seasonInfo.displayText}</span>
        </div>
        <div class="quota-info" id="quota-display">
          <span class="muted">利用状況: 不明（自動取得しません）</span>
        </div>
      </div>
    </div>`;
}
renderHeaderStats(membershipType) {
  if (membershipType === 'non_member') return '';
  
  return `
    <div class="header-stats">
      <div class="stat-item">
        <span class="stat-icon">📝</span>
        <span class="stat-value" id="total-records">-</span>
        <span class="stat-label">育成記録</span>
      </div>
      <div class="stat-item">
        <span class="stat-icon">👥</span>
        <span class="stat-value" id="consultation-count">-</span>
        <span class="stat-label">相談植物</span>
      </div>
      <div class="stat-item">
        <span class="stat-icon">📈</span>
        <span class="stat-value" id="growth-period">-</span>
        <span class="stat-label">記録期間</span>
      </div>
      ${membershipType === 'paid_member' ? `
        <div class="stat-item care-alerts-stat" id="care-alerts-stat" onclick="window.plantApp.showTodaysCareList()">
          <span class="stat-icon">🔔</span>
          <span class="stat-value" id="todays-care-count">-</span>
          <span class="stat-label">今日のケア</span>
        </div>
      ` : `
        <div class="stat-item">
          <span class="stat-icon">📋</span>
          <span class="stat-value" id="care-guide-count">6</span>
          <span class="stat-label">ケアガイド</span>
        </div>
      `}
    </div>
  `;
}
getCommonPayload(extra = {}) {
  return {
    user_email: this.userEmail,
    entitlement: this.entitlement,
    entitlement_snapshot: this.entitlementSnapshot,
    ...extra
  };
}
async loadHeaderStats() {
  const membershipType = this.getMembershipType();
  if (membershipType === 'non_member') return;

  try {
    const response = await fetch(`${this.apiBase}?action=header_stats`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_email: this.userEmail,
        entitlement: this.entitlement,
        entitlement_snapshot: this.entitlementSnapshot
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    if (!response.ok || !data.success) {
  if (data.error === 'consultation_limit_reached') {
    this.showConsultationLimitModal(data);
    return;
  }
  if (data.error === 'illustration_limit_reached') {
    this.showIllustrationLimitModal(data);
    return;
  }
  throw new Error(data.error || data.message || '投稿に失敗しました');
}
    if (data.success && data.stats) {
      this.updateHeaderStatsDisplay(data.stats);
    } else {
      console.warn('⚠️ 統計データ取得失敗 - フォールバック表示');
      this.updateHeaderStatsDisplay(null);
    }
  } catch (error) {
    console.error('❌ ヘッダー統計取得エラー:', error);
    this.updateHeaderStatsDisplay(null);
  }
}


updateHeaderStatsDisplay(stats) {
  if (!stats) {
    console.warn('⚠️ 統計データが空 - デフォルト値を使用');
    stats = {
      total_records: 0,
      consultation_count: 0,
      growth_period_days: 0,
      todays_care_count: 0
    };
  }
  
  console.log('統計データ更新:', stats);
  
  const totalRecordsEl = document.getElementById('total-records');
  if (totalRecordsEl) {
    totalRecordsEl.textContent = stats.total_records || 0;
  }
  
  const consultationCountEl = document.getElementById('consultation-count');
  if (consultationCountEl) {
    consultationCountEl.textContent = stats.consultation_count || 0;
  }
  
  const periodElement = document.getElementById('growth-period');
  if (periodElement) {
    const days = stats.growth_period_days || 0;
    periodElement.textContent = days > 0 ? `${days}日` : '-';
  }

  const careElement = document.getElementById('todays-care-count');
  if (careElement) {
    careElement.textContent = stats.todays_care_count || 0;
    careElement.parentElement?.classList.toggle('has-alerts', stats.todays_care_count > 0);
  }
}

async showTodaysCareList() {
  if (this.getMembershipType() !== 'paid_member') return;
  
  try {
    console.log('🔍 今日のケア取得開始');
    console.log('リクエスト:', {
      userEmail: this.userEmail,
      entitlement: this.entitlement
    });

    const response = await fetch(`${this.apiBase}?action=todays_care_list`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_email: this.userEmail,
        entitlement: this.entitlement,
        entitlement_snapshot: this.entitlementSnapshot
      })
    });

    console.log('レスポンスステータス:', response.status);
    const data = await response.json();
    console.log('🔍 APIレスポンス:', data);
    console.log('ケアアイテム数:', data.care_items?.length || 0);
    
    this.renderTodaysCareModal(data.care_items || []);
  } catch (error) {
    console.error('❌ 今日のケア一覧取得エラー:', error);
  }
}

renderTodaysCareModal(careItems) {
  this.closeAllModals();
  
  const modalHtml = `
    <div id="todays-care-modal" class="modal-overlay" onclick="window.plantApp.closeAllModals()">
      <div class="modal-content" onclick="event.stopPropagation()">
        <div class="modal-header">
          <h3>今日のケア対象</h3>
          <button onclick="window.plantApp.closeAllModals()" class="close-btn" type="button">×</button>
        </div>
        <div class="modal-body">
          ${careItems.length > 0 ? `
            <div class="care-items-list">
              ${careItems.map(item => `
                <div class="care-item">
                  <input type="checkbox" id="care-${item.id}" 
                         onchange="window.plantApp.toggleCareComplete('${item.thread_id}', '${item.care_type}')">
                  <label for="care-${item.id}">
                    <span class="care-icon">${item.care_icon}</span>
                    <span class="plant-name">${item.plant_name}</span>
                    <span class="care-name">${item.care_name}</span>
                    <span class="days-overdue">${item.days_overdue}日経過</span>
                  </label>
                </div>
              `).join('')}
            </div>
          ` : `
            <div class="no-care-today">
              <p>今日のケア対象はありません</p>
              <p>素晴らしい管理ができています！</p>
            </div>
          `}
        </div>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', modalHtml);
}


async toggleCareComplete(threadId, careType) {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    const response = await fetch(`${this.apiBase}?action=save_care_record`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        user_email: this.userEmail,
        entitlement: this.entitlement,
        entitlement_snapshot: this.entitlementSnapshot,
        thread_id: threadId,
        care_type: careType,
        care_date: today,
        notes: 'ケア通知から完了マーク',
        auto_detected: true
      })
    });

    const result = await response.json();
    
    if (result.success) {
      const careInfo = this.careTypes[careType] || this.careTypes.other;
      this.showTemporaryNotification(`${careInfo.name}のケア記録を保存しました`, 'success');
      
      // 統計を更新（モーダルを閉じる前に）
      await this.loadHeaderStats();
      
      // モーダルを閉じる
      this.closeAllModals();
      
    } else {
      throw new Error(result.error);
    }

  } catch (error) {
    console.error('ケア完了マークエラー:', error);
    this.showTemporaryNotification(`ケア記録の保存に失敗: ${error.message}`, 'error');
  }
}

  renderMainContent() {
    if (!this.isLoggedIn) {
      return `<div class="main-content">
          <div class="consultation-form-section">
            <h3>植物相談を体験してみる</h3>
            <div class="membership-notice">
              <h4>体験版（非会員）</h4>
              <ul>
                <li>AI植物相談（基本機能）</li>
                <li>記録保存なし</li>
                <li>画像生成なし</li>
                <li>ケア記録なし</li>
              </ul>
              <p style="margin-top: 12px; font-size: 14px;">
                <strong>無料会員登録</strong>で記録保存・ケア管理機能が使えます
              </p>
            </div>
            ${this.renderNonMemberConsultationForm()}
          </div>
          
          <div class="threads-section">
            <h3>会員登録のご案内</h3>
            ${this.renderMembershipBenefits()}
          </div>
        </div>`;
    }

    const membershipType = this.getMembershipType();
  console.log('renderMainContent 実行時の会員種別:', membershipType);
    
    return `<div class="main-content">
        <div class="consultation-form-section">
          <h3 class="plant-fk">新しい育成記録を投稿</h3>
          ${this.renderMembershipNotice(membershipType)}
          ${this.renderSeasonalInfoBanner()}
          ${this.renderConsultationForm()}
        </div>
        
<div class="threads-section">
  <h3 class="plant-fk">植物育成記録</h3>
  ${this.renderAdvertisementSection()}
  
  ${membershipType === 'non_member' ? 
    `<div class="non-member-notice">
      <h4>会員登録で記録保存機能を利用</h4>
      <p>会員登録（無料）すると、植物の育成記録を保存・管理できます。</p>
      <ul class="feature-list">
        <li>✅ 育成記録無制限投稿</li>
        <li>✅ 植物20個まで登録</li>
        <li>✅ ケア記録管理</li>
        <li>✅ 成長比較機能</li>
      </ul>
      <a href="/account/register" class="btn btn-primary">無料会員登録</a>
    </div>` :
    `<div id="threads-list" class="threads-container">
      <div class="loading">植物記録を読み込み中...</div>
    </div>`
  }
</div>
      </div>`;
  }

  renderMembershipBenefits() {
    return `<div class="membership-benefits">
        <div class="benefit-card">
          <h4>無料会員（月額0円）</h4>
          <ul>
            <li>育成記録無制限投稿</li>
            <li>投稿ごとに5回まで追加相談</li>
            <li>ケア記録管理</li>
            <li>成長比較機能</li>
            <li>植物20個まで登録</li>
            <li>記録のみ投稿対応</li>
            <li>季節対応ケア管理</li>
          </ul>
          <a href="/account/register" class="btn btn-primary">無料会員登録</a>
        </div>
        

        
        <div class="benefit-card premium">
          <h4>プレミアム会員（月換算300円）</h4>
  <p class="sub-note">※ 半年 / 年間プランから選べます</p>

  <ul>
    <li>全機能利用可能</li>
    <li>高品質分析</li>
    <li>植物物ケアAIイラスト画像回答（月100回）</li>
            <li>投稿ごとに5回まで追加相談</li>
            <li>ケア記録管理</li>
    <li>ケア設定カスタマイズ</li>
            <li>成長比較機能</li>
            <li>植物20個まで登録</li>
            <li>記録のみ投稿対応</li>
            <li>季節対応ケア管理</li>
          </ul>
  <div class="cta-group">
    <a href="https://leaf-laboratory.com/products/botareco-6m-pass" class="btn second-primary">
      半年プランを申し込む（300円×6ヶ月）
    </a>

    <a href="https://leaf-laboratory.com/products/botareco-annual-pass" class="btn btn-primary">
      年間プランを申し込む（300円×12ヶ月）
    </a>
  </div>
        </div>
      </div>`;
  }

renderMembershipNotice(membershipType) {
  const notices = {
    non_member: {
      title: '非会員プラン',
      features: ['基本相談のみ', '記録保存なし', '画像生成なし'],
      color: '#dc2626'
    },
    free_member: {
      title: '無料会員プラン（月額0円）', 
      features: [
        '育成記録無制限投稿',
        '投稿ごとに5回まで追加相談',
        'ケア記録管理',
        '成長比較機能',
        '植物20個まで登録',
        '記録のみ投稿対応',
        '季節対応ケア管理',
        '画像生成なし',
        'ケア通知なし'
      ],
      color: '#059669'
    },
    paid_member: {
      title: '有料会員プラン（月額300円）',
      features: [
        '全機能利用可能',
        '育成記録無制限投稿',
        '投稿ごとに5回まで追加相談',
        '成長比較機能',
        '植物50個まで登録',
        '記録のみ投稿対応',
        'イラスト生成（月100回）',
        '季節対応ケア通知',
        'ケア設定カスタマイズ'
      ],
      color: '#7c3aed'
    }
  };

  const notice = notices[membershipType];

  return `<details class="membership-notice">
      <summary class="membership-summary">
        <span class="membership-title">${notice.title}</span>
        <svg class="membership-arrow" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M7 10l5 5 5-5"></path>
        </svg>
      </summary>
      <ul class="membership-features">
        ${notice.features.map(feature => `<li>${feature}</li>`).join('')}
      </ul>
      ${membershipType === 'free_member' ? `
        <p class="membership-upgrade">
          画像生成・ケア通知機能は<a href="/products/leafla-subscription" style="color: #7c3aed;">月額300円</a>でご利用いただけます
        </p>
      ` : ''}
    </details>`;
}

  renderSeasonalInfoBanner() {
    const membershipType = this.getMembershipType();
    
    return `<div class="seasonal-info-banner">
        <h5>${this.seasonInfo.displayText} のケアポイント</h5>
        <p>${this.getSeasonalCareMessage(this.seasonInfo.season)}</p>
        ${membershipType === 'paid_member' ? 
          '<p><small>有料会員: ケア通知で季節に応じた間隔調整を自動実行中</small></p>' :
          '<p><small>季節対応ケア通知は有料会員限定機能です</small></p>'
        }
      </div>`;
  }

  getSeasonalCareMessage(season) {
    const messages = {
      spring: '成長期のため水やり・肥料の頻度を増やしましょう。植え替えにも適した季節です。',
      summer: '高温多湿のため水やりをこまめに、害虫対策も重要です。直射日光に注意。',
      autumn: '成長が緩やかになる時期。植え替えや剪定の最適シーズンです。',
      winter: '休眠期のため水やりを控えめに。暖かい場所で管理しましょう。'
    };
    return messages[season] || messages.autumn;
  }

  renderAdvertisementSection() {
    const seasonalProducts = this.getSeasonalProductRecommendations(this.seasonInfo.season);
    
    return `<div class="advertisement-section">
        <h5>${this.seasonInfo.seasonEmoji} ${this.seasonInfo.seasonName}におすすめの植物用品</h5>
        <div class="ad-content">
          <p>${seasonalProducts.message}</p>
          <a href="${seasonalProducts.link}" class="btn btn-small btn-secondary">
            ${seasonalProducts.buttonText}
          </a>
        </div>
      </div>`;
  }

  getSeasonalProductRecommendations(season) {
    const recommendations = {
      spring: {
        message: '成長期に最適な肥料・植え替え用土を特別価格でご提供',
        buttonText: '春の植物用品',
        link: '/collections/spring-plant-care'
      },
      summer: {
        message: '暑さ対策・害虫対策グッズを特別価格でご提供',
        buttonText: '夏の管理用品',
        link: '/collections/summer-plant-care'
      },
      autumn: {
        message: '植え替え・剪定ツールを特別価格でご提供',
        buttonText: '秋の作業用品',
        link: '/collections/autumn-plant-care'
      },
      winter: {
        message: '保温・湿度管理用品を特別価格でご提供',
        buttonText: '冬の管理用品',
        link: '/collections/winter-plant-care'
      }
    };
    
    return recommendations[season] || {
      message: '植物専用土・肥料・ツールを特別価格でご提供',
      buttonText: '商品を見る',
      link: '/collections/plant-care-products'
    };
  }

  renderConsultationForm() {
    const membershipType = this.getMembershipType();
    
    return `<form id="consultation-form" class="consultation-form">
        ${membershipType !== 'non_member' ? this.renderPlantSelectionSection() : ''}

        <div class="form-group">
          <label for="plant-name">植物名 *</label>
          <input type="text" id="plant-name" name="plant_name" required 
                 placeholder="例: ビカクシダ、リドレイ、多肉植物、ポトス">
          <div class="help-text">正確な植物名を入力すると、より適切なアドバイスを受けられます</div>
        </div>

        <div class="form-group">
          <label for="plant-image">植物の写真（任意）</label>
          <input type="file" id="plant-image" name="image" accept="image/*">
          <div class="help-text">
            写真があると状態をより正確に判断できます（JPEG, PNG, WebP対応・10MB以下）
          </div>
          <div class="image-preview" id="image-preview"></div>
        </div>

        <div class="form-group">
          <label for="notes">記録・備考</label>
          <textarea id="notes" name="notes" rows="3" 
                    placeholder="例: 新しい葉が出てきました、水やり後の状態、前回からの変化、気になる点など"></textarea>
          <div class="help-text">成長の記録や気づいたことを記入してください</div>
        </div>

        <div class="form-group">
          <label for="consultation">育て方について相談したいこと（任意）</label>
          <textarea id="consultation" name="consultation_request" rows="4" 
                    placeholder="例: 
- 葉の色が変わってきたのですが大丈夫でしょうか？
- 水やり頻度は適切ですか？
- 元気がないように見えるのですが原因は？
- 次にどんなケアをすべきでしょうか？

※空の場合は「記録のみ」として保存されます（AI分析なし）"></textarea>
          <div class="help-text">
            <strong>記録のみの場合</strong>: 相談内容を空にして「記録・備考」のみご記入ください<br>
            <strong>AI相談の場合</strong>: 相談内容を入力すると詳しい分析・アドバイスを受けられます<br>
            <strong>季節対応</strong>: 現在の季節（${this.seasonInfo.displayText}）を考慮したアドバイスを提供します
          </div>
        </div>
<!-- イラスト生成（有料会員のみ） -->
${membershipType === 'paid_member' ? `
  <div class="illustration-option-section">
    <label class="illustration-option">
      <input type="checkbox" id="enable-illustration-checkbox" name="enable_illustration" value="1" checked>
      <span class="option-text">AIケアイラストも生成する</span>
      <span class="option-note">相談内容に応じた植物ケアのイラストを自動生成（20〜30秒）</span>
    </label>
    <p class="illustration-requirement" style="font-size: 12px; color: #6b7280; margin-top: 8px;">
      ※ イラスト生成には「育て方について相談したいこと」の入力が必要です
    </p>
  </div>
` : '' }

${membershipType !== 'non_member' ? `
      <div class="sns-public-option-section">
        <label class="sns-public-option">
          <input type="checkbox" id="is-public-checkbox" name="is_public" value="1" checked>
          <span class="option-text">
            📢 この育成記録をSNSで公開する
            <span class="help-icon" title="公開すると、他のユーザーがあなたの育成記録を閲覧し、いいねやコメントができます。個人情報は含めないでください。">?</span>
          </span>
        </label>
        <div class="sns-public-info">
          <small>
            <a href="#" onclick="window.plantApp.previewPublicPost(); return false;">
              👁️ 公開時のプレビューを見る
            </a>
          </small>
          <small>⚠️ 公開後も「公開設定変更」ボタンで非公開に戻せます</small>
        </div>
      </div>
    ` : ''}

        <div class="form-actions">
          <button type="submit" id="submit-btn" class="btn btn-primary btn-submit">
            ${this.getSubmitButtonText(membershipType)}
          </button>
        </div>

        <div id="form-status" class="form-status br-form-status"></div>

      </form>`;
  }

  getSubmitButtonText(membershipType) {
    switch (membershipType) {
      case 'non_member': 
        return '育て方を体験する（記録保存なし）';
      case 'free_member': 
        return `育成記録を投稿する（${this.seasonInfo.seasonName}対応）`;
      case 'paid_member': 
        return `育成記録を投稿する（${this.seasonInfo.seasonName}対応・イラスト生成付き）`;
      default: 
        return '育て方を相談する';
    }
  }

  renderNonMemberConsultationForm() {
    return `<form id="consultation-form" class="consultation-form">
        <div class="form-group">
          <label for="plant-name">植物名 *</label>
          <input type="text" id="plant-name" name="plant_name" required 
                 placeholder="例: ビカクシダ、リドレイ、多肉植物、ポトス">
        </div>

        <div class="form-group">
          <label for="plant-image">植物の写真（任意）</label>
          <input type="file" id="plant-image" name="image" accept="image/*">
          <div class="help-text">
            <strong>体験版</strong>: 写真は分析に使用されますが保存されません
          </div>
          <div class="image-preview" id="image-preview"></div>
        </div>

        <div class="form-group">
          <label for="notes">現在の状態・記録</label>
          <textarea id="notes" name="notes" rows="3" placeholder="例: 新しい葉が出てきました、水やり後の状態、気になる変化など"></textarea>
        </div>

        <div class="form-group">
          <label for="consultation">育て方について相談したいこと *</label>
          <textarea id="consultation" name="consultation_request" rows="4" required
                    placeholder="例: 
- 葉の色が変わってきたのですが大丈夫でしょうか？
- 水やり頻度は適切ですか？
- この状態は正常でしょうか？"></textarea>
          <div class="help-text">
            体験版では相談内容の入力が必須です。現在の季節（${this.seasonInfo.displayText}）を考慮したアドバイスを提供します。
          </div>
        </div>
        <div class="form-actions">
          <button type="submit" id="submit-btn" class="btn btn-primary btn-submit">
            植物相談を体験する（記録保存なし）
          </button>
        </div>

        <div id="form-status" class="form-status br-form-status"></div>

      </form>`;
  }

  renderPlantSelectionSection() {
    const membershipType = this.getMembershipType();
    
    return `<div class="plant-selection-section">
        <h4 class="plant-fk">植物ケアの選択</h4>
        <p><small>既存植物への記録追加、または新規植物の記録開始を選択</small></p>
        
        <div class="selection-options">
          <label class="selection-option">
            <input type="radio" name="plant_selection_type" value="existing" id="radio-existing">
            <span class="option-text">既存の植物に育成記録を追加</span>
            <span class="option-note">登録済み植物のケア履歴に追加</span>
          </label>
          <label class="selection-option">
            <input type="radio" name="plant_selection_type" value="new" id="radio-new" checked>
            <span class="option-text">新しい植物の記録を開始</span>
            <span class="option-note">新規植物として登録・管理開始</span>
          </label>
        </div>
        
        <div id="existing-plants-dropdown" class="existing-plants-dropdown" style="display: none;">
          <label for="existing-plant-select">記録を追加する植物を選択:</label>
          <select id="existing-plant-select" name="existing_plant_id">
            <option value="">植物を読み込み中...</option>
          </select>
          <div class="seasonal-note">
            <small>${this.seasonInfo.displayText}の状況を考慮した記録・分析を実行</small>
          </div>
        </div>
        
        ${membershipType !== 'non_member' ? `<div class="plant-limit-reminder">
            <p><small>
              植物登録上限: ${membershipType === 'paid_member' ? '50個' : '20個'}
              ${membershipType === 'free_member' ? ' | 有料版で50個まで拡張可能' : ''}
            </small></p>
          </div>` : ''}
      </div>`;
  }

async submitConsultation() {
  // レート制限チェック
  const now = Date.now();
  const timeSinceLastSubmit = now - this._lastSubmitTime;
  
  if (timeSinceLastSubmit < this._minSubmitInterval) {
    const waitSeconds = Math.ceil((this._minSubmitInterval - timeSinceLastSubmit) / 1000);
    this.showTemporaryNotification(
      '連続投稿制限: あと' + waitSeconds + '秒お待ちください', 
      'warning'
    );
    return;
  }

  const form = document.getElementById('consultation-form');
  const formData = new FormData(form);
  
  console.log('📝 投稿処理開始');
  this.debugFormState();
  
  const extracted = this.extractPlantSelection(formData);
  const plantName = extracted.plantName;
  const isExistingPlant = extracted.isExistingPlant;
  const existingPlantId = extracted.existingPlantId;
  
  if (!plantName || plantName === '') {
    console.error('❌ 植物名が空です');
    this.showError('植物名を入力または選択してください。');
    return;
  }

  // ★★★ ES5互換の書き方 ★★★
  const consultationValue = formData.get('consultation_request');
  const notesValue = formData.get('notes');
  
  const consultationRequest = consultationValue ? String(consultationValue).trim() : '';
  const notes = notesValue ? String(notesValue).trim() : '';

  // ★★★ バリデーション ★★★
  if (!consultationRequest && !notes) {
    this.showError('「記録・備考」または「相談したいこと」のいずれかは入力してください。');
    return;
  }

  // ★★★ 記録のみモードの判定 ★★★
  const isRecordOnly = !consultationRequest;
  
  console.log('📊 投稿モード:', isRecordOnly ? '記録のみ' : 'AI相談');
  console.log('📊 相談内容:', consultationRequest.substring(0, 50));
  console.log('📊 記録内容:', notes.substring(0, 50));

  // ★★★ record_onlyフラグを確実に設定 ★★★
  if (isRecordOnly) {
    formData.set('record_only', 'true');
    formData.delete('enable_illustration');
    console.log('✅ record_only=true を設定（AI相談回数カウントなし）');
  } else {
    formData.delete('record_only');
    console.log('✅ AI相談モード（相談回数カウント）');
  }

  this.finalizeFormData(formData, plantName, isExistingPlant, existingPlantId);

  const statusDiv = document.getElementById('form-status'); 
  const submitBtn = document.getElementById('submit-btn'); 

  if (!statusDiv || !submitBtn) return;

  const membershipType = this.getMembershipType();

  submitBtn.disabled = true;
  submitBtn.style.pointerEvents = 'none';
  submitBtn.style.opacity = '0.6';
  submitBtn.textContent = isRecordOnly ? '記録保存中...' : 'AI分析中...';
  
  statusDiv.innerHTML = '<div class="loading-message"><div class="spinner"></div><p>投稿を受付中...</p></div>';

  try {
    this._lastSubmitTime = now;
    
    // ★★★ デバッグ：FormDataの全内容を確認 ★★★
    console.log('📦 送信する FormData の全内容:');
    for (var pair of formData.entries()) {
      var key = pair[0];
      var value = pair[1];
      if (value instanceof File) {
        console.log('  🖼️ ' + key + ': [File] ' + value.name + ' (' + value.size + ' bytes)');
      } else {
        console.log('  📄 ' + key + ':', value);
      }
    }
    
    // ★★★ record_onlyフラグが確実に含まれているか最終確認 ★★★
    const recordOnlyFlag = formData.get('record_only');
    console.log('🔍 record_only フラグ最終確認:', recordOnlyFlag);
    if (isRecordOnly && recordOnlyFlag !== 'true') {
      console.error('⚠️ WARNING: record_onlyフラグが正しく設定されていません！');
      formData.set('record_only', 'true');
      console.log('✅ record_onlyフラグを再設定しました');
    }
     
    const response = await fetch(
      'https://laixgcjvowdszrtdpxlq.supabase.co/functions/v1/accept-consultation',
      {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + this.SUPABASE_ANON_KEY,
          'apikey': this.SUPABASE_ANON_KEY,
          'x-client-info': 'botareco-web'
        },
        body: formData
      }
    );

    const data = await response.json();
    
    if (!response.ok) {
      if (data.error === 'consultation_limit_reached') {
        console.error('❌ 相談回数制限エラー');
        console.error('   送信したrecord_only:', recordOnlyFlag);
        console.error('   サーバーレスポンス:', data);
        this.showConsultationLimitModal(data);
        return;
      }
      throw new Error(data.error || data.message || '投稿に失敗しました');
    }
    
    console.log('✅ サーバーレスポンス:', data);

if (!data.success) {
  throw new Error(data.error || data.message || '投稿に失敗しました');
}

// ★★★ 記録のみモードの処理 ★★★
if (data.record_only) {
  console.log('✅ 記録のみモード完了:', data.post_id);
  
  statusDiv.innerHTML = '<div class="success-message"><h4>✅ 記録を保存しました</h4><p>植物の成長記録として保存されました。</p></div>';
  
  // フォームリセット
  form.reset();
  this.selectedPlantData = null;
  
  // スレッド一覧を再読み込み
  this.loadUserThreads();
  this.loadExistingPlantsForSelection();
  
  return; // ★ ここで終了
}

if (!data.job_id && !data.ai_response) {
  throw new Error('サーバーが正しいレスポンスを返しませんでした');
}

    if (data.job_id) {
      statusDiv.innerHTML = this.getAiProcessingHtml();
      this.initAiProcessingTip();
      this.pollJobStatus(data.job_id, plantName, membershipType);
    } else {
      this.handleJobCompleted(data, plantName, membershipType);
    }

  } catch (error) {
    this._lastSubmitTime = 0;
    console.error('❌ 送信エラー:', error);
    statusDiv.innerHTML = '<div class="error-message"><h4>送信に失敗しました</h4><p>エラー: ' + error.message + '</p><p><small>サーバーとの通信に問題が発生しました。しばらくしてから再試行してください。</small></p></div>';
  } finally {
    submitBtn.disabled = false;
    submitBtn.style.pointerEvents = 'auto';
    submitBtn.style.opacity = '1';
    submitBtn.textContent = this.getSubmitButtonText(membershipType);
  }
}

async pollJobStatus(jobId, plantName, membershipType, maxAttempts = 600) {
  let attempts = 0;
  const statusDiv = document.getElementById('form-status');
  
  const checkStatus = async () => {
    attempts++;
    
    try {
      const response = await fetch(
        `https://laixgcjvowdszrtdpxlq.supabase.co/rest/v1/consultation_jobs?id=eq.${jobId}&select=*`,
        {
          headers: {
            'apikey': this.SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${this.SUPABASE_ANON_KEY}`,
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          }
        }
      );
      
      // ★★★ HTTPエラーチェック追加 ★★★
      if (!response.ok) {
        console.error('Job status fetch failed:', response.status, response.statusText);
        setTimeout(checkStatus, 3000);
        return;
      }
      
      // ★★★ レスポンス形式チェック追加 ★★★
      const data = await response.json();
      
      if (!Array.isArray(data) || data.length === 0) {
        console.error('Unexpected response format or empty result:', data);
        setTimeout(checkStatus, 3000);
        return;
      }
      
      const job = data[0];
      
      if (job.status === 'completed') {
        console.log('✅ AI分析完了');
        
        if (!job.ai_generated_image_url) {
          console.log('⏳ 画像URL更新待機中...');
          await new Promise(resolve => setTimeout(resolve, 500));
          
          const retryResponse = await fetch(
            `https://laixgcjvowdszrtdpxlq.supabase.co/rest/v1/consultation_jobs?id=eq.${jobId}&select=*`,
            {
              headers: {
                'apikey': this.SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${this.SUPABASE_ANON_KEY}`,
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
              }
            }
          );
          const retryData = await retryResponse.json();
          const retryJob = Array.isArray(retryData) ? retryData[0] : retryData;
          console.log('🔄 再取得結果:', retryJob.ai_generated_image_url);
          this.handleJobCompleted(retryJob, plantName, membershipType);
        } else {
          this.handleJobCompleted(job, plantName, membershipType);
        }
        return;
      } else if (job.status === 'failed') {
        console.log('❌ AI分析失敗');
        this.handleJobFailed(job);
        return;
      } else if (attempts >= maxAttempts) {
        console.log('⏰ タイムアウト');
        this.handleJobTimeout();
        return;
      }
      
      setTimeout(checkStatus, 3000);
      
    } catch (error) {
      console.error('Polling error:', error);
      
      // ★★★ 最大試行回数チェック追加 ★★★
      if (attempts >= maxAttempts) {
        console.log('⏰ タイムアウト（エラーによる）');
        this.handleJobTimeout();
        return;
      }
      
      setTimeout(checkStatus, 3000);
    }
  };
  
  checkStatus();
}

handleJobCompleted(job, plantName, membershipType) {
  console.log('✅ ジョブ完了:', job);
  
  const statusDiv = document.getElementById('form-status');
  
  // result JSONをパース
  let parsedResult = {};
  try {
    if (typeof job.result === 'string') {
      parsedResult = JSON.parse(job.result);
    } else {
      parsedResult = job.result || {};
    }
  } catch (e) {
    console.warn('result JSON parse error:', e);
  }
  
  const aiResponse = parsedResult.ai_response || job.ai_response || '';
  const aiGeneratedImageUrl = parsedResult.ai_generated_image_url || job.ai_generated_image_url || null;
  const productRecommendations = job.product_recommendations || [];
  const articleRecommendations = job.article_recommendations || [];
  
  // ★★★ ここに追加 ★★★
  // ジョブテーブルから最新のクオータ情報を取得して表示を更新
  this.applyQuotaFromResponse({
    consultation_quota: job.consultation_quota,
    illustration_quota: job.illustration_quota,
    plant_count: this.existingPlants.length
  });
  
  // 画面に表示
  let html = `
    <div class="success-message">
      <h4>分析が完了しました！</h4>
      
      <div class="ai-response-section">
        <h5>AI分析結果:</h5>
        <div class="response-content">${this.formatResponse(aiResponse)}</div>
      </div>
  `;
  
  // ★ 画像があれば追加
  if (aiGeneratedImageUrl) {
    html += `
      <div class="ai-illustration" style="margin-top: 20px;">
        <h4>📸 イラスト</h4>
        <img src="${aiGeneratedImageUrl}" alt="AI生成イラスト" style="max-width: 100%; border-radius: 8px;" />
      </div>
    `;
  }
  
  if (membershipType !== 'non_member') {
    html += `
      <div class="record-saved-notice">
        <p>この育成記録は「${plantName}」として保存されました</p>
      </div>
    `;
  }
  
  // ★★ 商品推奨を追加 ★★
  if (productRecommendations && productRecommendations.length > 0) {
    html += `
      <div class="product-recommendations-section">
        <h5>おすすめ商品</h5>
        ${productRecommendations.map(product => `
          <div class="recommendation-item ${product.is_pr ? 'pr-item' : ''}">
            <div class="rec-header">
              <h6>${this.escapeHtml(product.product_name)}</h6>
              ${product.is_pr ? '<span class="pr-badge">PR</span>' : ''}
            </div>
            <p>${this.escapeHtml(product.description || '')}</p>
            <div class="product-details">
              ${product.price_range ? `<span class="price-range">${this.escapeHtml(product.price_range)}</span>` : ''}
            </div>
            <a href="${product.product_url}" target="_blank" class="btn btn-small btn-secondary">
              商品を見る
            </a>
          </div>
        `).join('')}
      </div>
    `;
  }
  
  // ★★ 記事推奨を追加 ★★
  if (articleRecommendations && articleRecommendations.length > 0) {
    html += `
      <div class="article-recommendations-section">
        <h5>参考記事</h5>
        ${articleRecommendations.map(article => `
          <div class="recommendation-item">
            <h6>${this.escapeHtml(article.title)}</h6>
            <p>${this.escapeHtml(article.summary || '')}</p>
            <a href="${article.url}" target="_blank" class="btn btn-small btn-tertiary">
              記事を読む
            </a>
          </div>
        `).join('')}
      </div>
    `;
  }
  
  html += `</div>`;
  
  statusDiv.innerHTML = html;
    // ★★★ ここに追加 ★★★
  if (job.consultation_quota || job.illustration_quota) {
    this.applyQuotaFromResponse({
      consultation_quota: job.consultation_quota,
      illustration_quota: job.illustration_quota,
      plant_count: this.existingPlants.length
    });
    
  }
  
// フォームリセット（以下既存コード）
  document.getElementById('consultation-form').reset();
  
  if (membershipType !== 'non_member') {
    this.loadUserThreads();
    this.loadExistingPlantsForSelection();
    
    // ★ 最新のquota情報を取得（ジョブテーブルの古い値ではなく、DBから直接取得）
    setTimeout(() => {
      this.loadQuotaInfo(true);
    }, 500);
  }
}

handleJobFailed(job) {
  const statusDiv = document.getElementById('form-status');
  statusDiv.innerHTML = `
    <div class="error-message">
      <h4>AI分析に失敗しました</h4>
      <p>${job.error_message || '不明なエラー'}</p>
    </div>
  `;
}

handleJobTimeout() {
  const statusDiv = document.getElementById('form-status');
  statusDiv.innerHTML = `
    <div class="warning-message">
      <h4>処理に時間がかかっています</h4>
      <p>後ほど植物記録一覧から結果をご確認ください</p>
    </div>
  `;
  
  // フォームリセット
  document.getElementById('consultation-form').reset();
  
  // 投稿リスト更新
  setTimeout(() => {
    this.loadUserThreads();
    this.loadExistingPlantsForSelection();
  }, 2000);
}
// =====================
// AI待機アニメ UI 作成
// =====================
getAiProcessingHtml() {
  return `
    <div class="br-processing-core">
      <div class="br-processing-wrap">
        <img src="https://cdn.shopify.com/s/files/1/0658/5332/5495/files/t5.png?v=1765098930"
             class="br-processing-cactus"
             alt="AI審査中のイメージ">

        <div class="br-ellipse-line br-left-half"></div>
        <div class="br-ellipse-line br-right-half"></div>
      </div>

      <p class="br-processing-title">AIが内容を審査中です</p>
      <p class="br-processing-sub">少しお待ちください（10〜30秒ほど）</p>
    </div>

    <div class="br-processing-tip" id="br-processing-tip">
      <div class="br-processing-tip-inner">
        <img id="br-processing-tip-img" src="" alt="" class="br-processing-tip-img">
        <p id="br-processing-tip-text" class="br-processing-tip-text"></p>
      </div>
    </div>

    <div class="br-processing-ad" id="br-processing-ad"></div>
  `;
}


// =====================
// ランダムTIP 初期化
// =====================
initAiProcessingTip() {
  const tipBlock = document.getElementById("br-processing-tip");
  const tipImg   = document.getElementById("br-processing-tip-img");
  const tipText  = document.getElementById("br-processing-tip-text");
  const adBlock  = document.getElementById("br-processing-ad");

  if (!tipBlock || !tipImg || !tipText) return;

  if (adBlock && adBlock.children.length > 0) {
    tipBlock.style.display = "none";
    return;
  }

  const tips = [
    {
      img: "https://cdn.shopify.com/s/files/1/0658/5332/5495/files/il1.png?v=1765080480",
      text: "葉の表面を軽く整えてから撮ると成長が比べやすくなります。"
    },
    {
      img: "https://cdn.shopify.com/s/files/1/0658/5332/5495/files/il7.png?v=1765080480",
      text: "毎日の一枚が、後で成長の道筋を見せてくれます。"
    }
  ];

  const pick = tips[Math.floor(Math.random() * tips.length)];
  tipImg.src = pick.img;
  tipImg.alt = "植物ケアアドバイス";
  tipText.textContent = pick.text;
}


  extractPlantSelection(formData) {
    const selectionType = formData.get('plant_selection_type');
    let existingPlantId = formData.get('existing_plant_id');
    let plantName = '';
    let isExistingPlant = false;
    
    const plantNameInput = document.getElementById('plant-name');
    if (plantNameInput) {
      plantName = plantNameInput.value?.trim() || '';
    }
    
    const existingRadio = document.getElementById('radio-existing');
    const existingSelect = document.getElementById('existing-plant-select');
    
    if ((existingRadio && existingRadio.checked) || this.lastSelectedPlant) {
      if (existingSelect && existingSelect.value) {
        existingPlantId = existingSelect.value;
        const selectedOption = existingSelect.selectedOptions[0];
        
        if (selectedOption && selectedOption.dataset.plantName) {
          plantName = selectedOption.dataset.plantName.trim();
          isExistingPlant = true;
          
          console.log('既存植物選択確認:', {
            threadId: existingPlantId,
            plantName: plantName
          });
        }
      } else if (this.lastSelectedPlant) {
        existingPlantId = this.lastSelectedPlant.id;
        plantName = this.lastSelectedPlant.name;
        isExistingPlant = true;
        
        console.log('記憶した植物情報を使用:', {
          threadId: existingPlantId,
          plantName: plantName
        });
      }
    }

    return { plantName, isExistingPlant, existingPlantId };
  }

finalizeFormData(formData, plantName, isExistingPlant, existingPlantId) {
    if (isExistingPlant && existingPlantId) {
      formData.set('plant_name', plantName);
      formData.set('plant_selection_type', 'existing');
      formData.set('existing_plant_id', existingPlantId);
      formData.append('existing_thread_id', existingPlantId);
      
      console.log('既存植物用FormData設定:', {
        plant_name: plantName,
        existing_thread_id: existingPlantId
      });
    } else {
      formData.set('plant_name', plantName);
      formData.set('plant_selection_type', 'new');
      
      console.log('新規植物用FormData設定:', {
        plant_name: plantName
      });
    }

let userEmail = this.userEmail || '';
if (!userEmail) {
  userEmail = this.getAnonymousId();
  console.log('📧 匿名ID使用:', userEmail);
  
  // ★★★ フィンガープリント追加 ★★★
  const fingerprint = this.getBrowserFingerprint();
  if (fingerprint) {
    formData.append('browser_fingerprint', fingerprint);
    console.log('🔍 フィンガープリント送信:', fingerprint);
  }
  // ★★★ ここまで追加 ★★★
  
} else {
  console.log('📧 ログインユーザー:', userEmail);
}
formData.append('user_email', userEmail);
    const membershipType = this.getMembershipType();
    if (membershipType !== 'non_member') {
      const isPublicCheckbox = document.getElementById('is-public-checkbox');
      const isPublic = isPublicCheckbox ? isPublicCheckbox.checked : false;
      formData.append('is_public', isPublic ? 'true' : 'false');
      console.log('📢 SNS公開設定:', isPublic);
    }
    if (this.entitlement && typeof this.entitlement === 'object' && Object.keys(this.entitlement).length > 0) {
      const safeEntitlement = {
        status: this.entitlement.status,
        plan_code: this.entitlement.plan_code,
        expires_at: this.entitlement.expires_at
      };
      formData.append('entitlement', JSON.stringify(safeEntitlement));
    }

    if (this.entitlementSnapshot && typeof this.entitlementSnapshot === 'object' && Object.keys(this.entitlementSnapshot).length > 0) {
      const safeSnapshot = {
        status: this.entitlementSnapshot.status,
        plan_code: this.entitlementSnapshot.plan_code,
        expires_at: this.entitlementSnapshot.expires_at,
        consultation_pack_count: this.entitlementSnapshot.consultation_pack_count,
        illustration_pack_count: this.entitlementSnapshot.illustration_pack_count
      };
      formData.append('entitlement_snapshot', JSON.stringify(safeSnapshot));
    }
    
    const safeSeason = {
      season: this.seasonInfo?.season || 'winter',
      seasonName: this.seasonInfo?.seasonName || '冬',
      seasonEmoji: this.seasonInfo?.seasonEmoji || '❄️',
      displayText: this.seasonInfo?.displayText || '❄️ 冬',
      month: this.seasonInfo?.month || 12
    };
    formData.append('current_season', JSON.stringify(safeSeason));
    
    const consultationRequest = formData.get('consultation_request') || '';
    const notes = formData.get('notes') || '';
    const classification = this.classifyScene({ plantName, consultationRequest, notes, aiResponse: '' });

const forced = this.getForcedSceneFromText(`${consultationRequest} ${notes}`);
const scenePayload = {
  scene: forced || classification.scene,
  confidence: classification.confidence,
  plant_type: classification.plantType,
  forced: !!forced
};

    scenePayload.confidence = Number(scenePayload.confidence.toFixed(2));
    console.log('scene_hint', scenePayload);

    formData.append('scene_hint', JSON.stringify(scenePayload));

    if (isExistingPlant && existingPlantId && plantName) {
      const lockedName = (plantName || '').normalize('NFC').trim();
      formData.append('selected_plant_name', lockedName);
      formData.append(
        'name_lock_policy',
        'selected_plant_name を第1候補として扱う。写真が明確に矛盾する場合のみ別候補を挙げ、その根拠（刺座の形/密度、葉厚、葉先の形、リーフインプレッション等）を箇条書きで比較する。無関係な固有名は出さない。'
      );
    }

    const membership = this.getMembershipType();
    const visionGuidance = [
      '日本語で簡潔に。写真を主要根拠に、最有力候補(1〜2)だけを提示し、各候補について「葉の厚み/色調」「刺座の形」「刺の太さ・間隔」「ロゼット密度」「葉縁の波打ち」の観察根拠を1行ずつ比較対比する（表現は短文箇条書き）。',
      '断定は避けつつも曖昧語の連発はしない。「最有力」「次点」のように優劣を必ずつける。',
      '「今すぐやること」を最大3つに絞り、番号付きで具体的な操作単位に分解（例: 1) 乾きチェック→2) 用土の通気改善→3) 直射の時間制限）。',
      '写真が不十分なら「観察ポイント（3つ）」と「再撮影の指示（角度/距離/明るさ/背景）」を必ず出す。',
      '刺の取り扱いなど安全注意があれば最後に1行で注意喚起。',
      'アガベ系では水やり/光/温度/用土を各1行、季節（current_season）の傾向に合わせて頻度の強弱も短く示す。'
    ];

    if (membership === 'paid_member') {
      visionGuidance.push('候補ごとに水やり/光/温度/土の要点を1行ずつ添える。');
    }

    formData.append('vision_guidance', visionGuidance.join(' '));
    formData.append(
      'photo_first_policy',
      '回答は必ず写真を主要根拠に。未添付時は登録写真(reference_image_url)を使用。どちらも無い場合のみ候補＋観察ポイント＋再撮影指示で補完し、曖昧な否定はしない。'
    );

    formData.append('client_image_autogen_enabled', 'false');
  }

  async handleSuccessfulSubmission(data, isRecordOnly, plantName, membershipType, isExistingPlant, existingPlantId, consultationRequest, notes) {

    const statusDiv = document.getElementById('form-status');
    const postId = data.post_id;
    
    if (isExistingPlant && existingPlantId) {
      this.lastSelectedPlant = {
        id: existingPlantId,
        name: plantName
      };
      console.log('既存植物選択を記録:', this.lastSelectedPlant);
    } else {
      this.lastSelectedPlant = null;
      console.log('新規植物のため選択状態をクリア');
    }
    

    // まずUIを描画（ここで .success-message/.ai-generated-image のコンテナが出来る）
    if (data.record_only) {
      statusDiv.innerHTML = this.renderRecordOnlySuccess(data, plantName, postId, membershipType);
    } else if (data.non_plant_response) {
      statusDiv.innerHTML = this.renderNonPlantResponse(data);
    } else {
      statusDiv.innerHTML = this.renderFullConsultationSuccess(data, plantName, postId, membershipType);
    }

    // ▼ その後にフォールバック生成（描画完了後なのでDOMに挿入・差し替えが確実）
if (!data.record_only && !data.non_plant_response) {
  try {
const needServerSide =
  membershipType === 'paid_member' &&
  !data.ai_generated_image_url &&
  data.illustration_requested === true &&  // ★ !== false → === true に変更
  (window.LEAFLA?.features?.text_free_illustration !== false);

if (needServerSide) {
  // ★ 修正：FormDataから実際の値を取得
  const formElement = document.getElementById('consultation-form');
  const currentFormData = new FormData(formElement);
  
  const actualConsultationRequest = currentFormData.get('consultation_request') || '';
  const actualNotes = currentFormData.get('notes') || '';
  
  const hint = this.classifyScene({ 
    plantName, 
    consultationRequest: actualConsultationRequest, 
    notes: actualNotes, 
    aiResponse: data.ai_response || '' 
  });
  
  const forced = this.getForcedSceneFromText(`${actualConsultationRequest} ${actualNotes}`);
  const scene = forced || hint.scene;
  const plantType = hint.plantType;

  const targetThreadId = (isExistingPlant && existingPlantId) 
                          ? existingPlantId 
                          : data.thread_id || data.post_id;

// 直前で actualConsultationRequest / actualNotes を取得しているので、それを渡す
const imageUrl = await this.requestServerIllustrationPatch({
  plantName,
  scene,
  plantType,
  postId: data.post_id,
  threadId: targetThreadId,
  aiResponse: data.ai_response,
  consultationRequest: actualConsultationRequest, // ★ここを修正
  notes: actualNotes                              // ★ここを修正
});



if (imageUrl) {
  // 既存枠があれば差し替え、無ければ季節ケア提案の後に挿入
  const img = document.querySelector('.ai-generated-image .image-container img');
  if (img) {
    img.src = imageUrl;
  } else {
    // 季節ケア提案の後に挿入
    const seasonalSection = document.querySelector('.seasonal-care-suggestion');
    if (seasonalSection) {
      seasonalSection.insertAdjacentHTML('afterend', `
        <div class="ai-generated-image">
          <h5>植物ケアイラスト</h5>
          <div class="image-container">
            <img src="${imageUrl}" alt="植物ケアイラスト" style="max-width: 100%; border-radius: 8px; cursor: pointer;" loading="lazy"
                 onclick="window.plantApp.showImageFullscreen('${imageUrl}', '植物ケアイラスト')">
            <div class="watermark">LEAFLA</div>
          </div>
        </div>
      `);
    } else {
      const wrap = document.querySelector('.success-message') || statusDiv;
      wrap.insertAdjacentHTML('beforeend', `
        <div class="ai-generated-image">
          <h5>植物ケアイラスト</h5>
          <div class="image-container">
            <img src="${imageUrl}" alt="植物ケアイラスト" style="max-width: 100%; border-radius: 8px; cursor: pointer;" loading="lazy"
                 onclick="window.plantApp.showImageFullscreen('${imageUrl}', '植物ケアイラスト')">
            <div class="watermark">LEAFLA</div>
          </div>
        </div>
      `);
    }
  }
}
    }
  } catch (e) {
    console.warn('サーバー側画像生成呼び出しで例外:', e);
    this.showTemporaryNotification('イラスト生成に失敗（通信エラー）', 'error');
  }
}


    const form = document.getElementById('consultation-form');
    form.reset();
    document.getElementById('image-preview').innerHTML = '';

    if (this.lastSelectedPlant && membershipType !== 'non_member') {
      console.log('植物選択状態を復元開始:', this.lastSelectedPlant);
      this.restorePlantSelection();
    }

if (membershipType !== 'non_member') {
  // 植物リスト更新完了を待つ
  await Promise.all([
    this.loadUserThreads(),
    this.loadExistingPlantsForSelection()
  ]);
  
  console.log('投稿後の植物数:', this.existingPlants.length);
  
  // クオータ表示を更新（最新の植物数を反映）
  this.applyQuotaFromResponse({
    plant_count: this.existingPlants.length,
    ...data
  });
  
  if (this.lastSelectedPlant) {
    setTimeout(() => {
      this.restorePlantSelection();
    }, 300);
  }
} else {
  this.applyQuotaFromResponse?.(data);
}
  }

renderFullConsultationSuccess(data, plantName, postId, membershipType) {
  return `<div class="success-message">
      <h4>分析が完了しました！</h4>
      
      <div class="ai-response-section">
        <h5>AI分析結果:</h5>
        <div class="response-content">${this.formatResponse(data.ai_response)}</div>
        <div class="analysis-info">
          <small>分析時の季節情報: ${this.seasonInfo.displayText}を考慮</small>
        </div>
      </div>
        
        ${data.ai_generated_image_url ? `
          <div class="ai-generated-image">
            <h5>植物ケアイラスト（画像生成）</h5>
            <div class="image-container">
              <img src="${data.ai_generated_image_url}" 
                   alt="植物ケアイラスト" 
                   onclick="window.plantApp.showImageFullscreen('${data.ai_generated_image_url}', '植物ケアイラスト')"
                   style="max-width: 100%; border-radius: 8px; cursor: pointer;"
                   loading="lazy">
              <div class="watermark">LEAFLA</div>
            </div>
            <p>相談内容から最適なケアシーンをイラストで表現</p>
            <div class="image-generation-info">
              <small>有料会員特典: AI画像生成機能（Gemini 2.5-flash-image-preview）</small>
            </div>
          </div>
        ` : ''}
        
        ${membershipType !== 'non_member' && postId ? `
          <div class="record-saved-notice">
            <p>この育成記録は「${plantName}」として保存されました</p>
            <p><strong>この投稿に対して5回まで追加相談</strong>ができます</p>
          </div>
          
          ${this.renderFollowUpSection(postId, 0)}
        ` : ''}

        <div class="seasonal-care-suggestion">
          <h6>${this.seasonInfo.seasonEmoji} 今の季節のケアポイント</h6>
          <p>${this.getSeasonalCareMessage(this.seasonInfo.season)}</p>
          ${membershipType === 'paid_member' ? 
            '<small>有料会員: ケア通知機能で季節に応じた管理をサポート中</small>' : 
            '<small>季節対応ケア通知は有料会員限定機能です</small>'
          }
          
        </div>

      
      ${data.product_recommendations && data.product_recommendations.length > 0 ? `
        <div class="product-recommendations-section">
          <h5>おすすめ商品</h5>
          ${data.product_recommendations.map(product => `
            <div class="recommendation-item ${product.is_pr ? 'pr-item' : ''}">
              <div class="rec-header">
                <h6>${this.escapeHtml(product.product_name)}</h6>
                ${product.is_pr ? '<span class="pr-badge">PR</span>' : ''}
              </div>
              <p>${this.escapeHtml(product.description || '')}</p>
              <div class="product-details">
                ${product.price_range ? `<span class="price-range">${this.escapeHtml(product.price_range)}</span>` : ''}
              </div>
              <a href="${product.product_url}" target="_blank" class="btn btn-small btn-secondary">
                商品を見る
              </a>
            </div>
          `).join('')}
        </div>
      ` : ''}
      
      ${data.article_recommendations && data.article_recommendations.length > 0 ? `
        <div class="article-recommendations-section">
          <h5>参考記事</h5>
          ${data.article_recommendations.map(article => `
            <div class="recommendation-item">
              <h6>${this.escapeHtml(article.title)}</h6>
              <p>${this.escapeHtml(article.summary || '')}</p>
              <a href="${article.url}" target="_blank" class="btn btn-small btn-tertiary">
                記事を読む
              </a>
            </div>
          `).join('')}
        </div>
      ` : ''}
      </div>`;
  }

  renderRecordOnlySuccess(data, plantName, postId, membershipType) {
    return `<div class="success-message">
        <h4>記録が保存されました！</h4>
        
        <div class="record-only-notice">
          <h5>育成記録として保存</h5>
          <div class="record-details">
            <p><strong>植物名:</strong> 「${this.escapeHtml(plantName)}」</p>
            <p><strong>記録内容:</strong> ${this.escapeHtml(data.notes || '記録済み')}</p>
            <p><strong>保存日時:</strong> ${new Date().toLocaleString('ja-JP')}</p>
            <p><strong>季節情報:</strong> ${this.seasonInfo.displayText}として記録</p>
          </div>
          <div class="record-only-info">
            <p><strong>記録のみ投稿</strong>のため、AI分析は実行されませんでした</p>
            <p>相談したい場合は「育て方について相談したいこと」欄に内容を記入してください</p>
          </div>
        </div>
        
        ${membershipType !== 'non_member' && postId ? `
          <div class="record-saved-notice">
            <p>この育成記録は「${plantName}」として保存されました</p>
            <p><strong>この投稿に対して5回まで追加相談</strong>ができます</p>
          </div>
          
          ${this.renderFollowUpSection(postId, 0)}
        ` : ''}
        
        <div class="seasonal-tips-success">
          <h6>${this.seasonInfo.seasonEmoji} ${this.seasonInfo.seasonName}のケアのコツ</h6>
          <p>${this.getSeasonalCareMessage(this.seasonInfo.season)}</p>
        </div>
      </div>`;
  }

  renderNonPlantResponse(data) {
    return `<div class="info-message">
        <h4>植物育成専門サービス</h4>
        <div class="non-plant-response">
          <div class="response-content">${this.formatResponse(data.ai_response)}</div>
          <div class="service-guide">
            <h6>LEAFLAでご相談いただける内容</h6>
            <div class="consultation-examples">
              <div class="example-category">
                <strong>植物の状態について</strong>
                <ul>
                  <li>葉の色が変わってきた</li>
                  <li>元気がないように見える</li>
                  <li>成長が止まっている</li>
                  <li>葉が黄色くなっている</li>
                  <li>新芽が出ない</li>
                </ul>
              </div>
              <div class="example-category">
                <strong>ケア方法について</strong>
                <ul>
                  <li>水やりの頻度やタイミング</li>
                  <li>肥料の種類や与え方</li>
                  <li>日光の当て方</li>
                  <li>湿度の管理方法</li>
                  <li>冬越しの方法</li>
                </ul>
              </div>
              <div class="example-category">
                <strong>管理作業について</strong>
                <ul>
                  <li>植え替えの方法や時期</li>
                  <li>剪定の仕方</li>
                  <li>病気や害虫の対策</li>
                  <li>増殖方法</li>
                  <li>季節に応じたケア</li>
                </ul>
              </div>
            </div>
            <div class="specialized-note">
              <p><strong>専門特化</strong>により、植物に関する質問により適切にお答えできます</p>
            </div>
          </div>
        </div>
      </div>`;
  }

  renderFollowUpSection(postId, currentCount) {
    const remainingCount = 5 - currentCount;
    
    return `<div class="follow-up-section" id="follow-up-section-${postId}">
        <h5>この記録について追加で相談する (${currentCount}/5)</h5>
        
        ${remainingCount > 0 ? `
          <div class="follow-up-form">
            <textarea id="follow-up-text-${postId}" 
                      placeholder="この記録について追加で質問したいことを入力してください

例: 
- この状態は正常ですか？
- 水やりのタイミングは？
- 次のケアで気をつけることは？
- ${this.seasonInfo.seasonName}の間に特に注意すべきことは？" 
                      rows="3"></textarea>
            <div class="follow-up-actions">
              <button onclick="window.plantApp.submitFollowUp('${postId}')" class="btn btn-secondary">
                追加相談する (残り${remainingCount}回)
              </button>
              <button onclick="window.plantApp.showFollowUpModal('${postId}')" class="btn btn-tertiary">
                詳細な追加相談フォーム
              </button>
            </div>
            <div class="follow-up-tips">
              <small>
                季節情報（${this.seasonInfo.displayText}）も考慮した詳細回答を受けられます
              </small>
            </div>
          </div>
        ` : `
          <div class="follow-up-limit-reached">
            <p class="limit-reached">この記録への追加相談は5回に達しました</p>
            <div class="limit-reached-info">
              <p><small>新しい投稿をすることで、また5回まで追加相談できます</small></p>
            </div>
          </div>
        `}
        
        <div id="follow-ups-list-${postId}" class="follow-ups-list">
          <!-- 追加相談履歴がここに表示される -->
        </div>
      </div>`;
  }

  handlePlantLimitError(data) {
    const statusDiv = document.getElementById('form-status');
    
    statusDiv.innerHTML = `
      <div class="error-message plant-limit-error">
        <h4>植物登録数制限に達しました</h4>
        <div class="limit-info">
          <p><strong>現在の状況:</strong></p>
          <ul>
            <li>登録済み植物: ${data.current_count || 0}個</li>
            <li>プラン上限: ${data.limit || 0}個</li>
            <li>会員種別: ${data.membership_type === 'free_member' ? '無料会員' : '一般会員'}</li>
          </ul>
        </div>
        
        ${data.upgrade_required ? `
          <div class="upgrade-suggestion">
            <h5>有料会員にアップグレードで解決</h5>
            <div class="upgrade-comparison">
              <div class="current-plan">
                <h6>現在（無料会員）</h6>
                <ul>
                  <li>植物登録: 20個まで</li>
                  <li>ケア通知: なし</li>
                  <li>画像生成: なし</li>
                </ul>
              </div>
              <div class="upgrade-plan">
                <h6>有料会員（月額300円）</h6>
                <ul>
                  <li>植物登録: <strong>50個まで</strong></li>
                  <li>季節対応ケア通知機能</li>
                  <li>AI画像生成（月100回）</li>
                  <li>高品質分析</li>
                </ul>
              </div>
            </div>
            <div class="upgrade-action">
              <a href="/products/leafla-subscription" class="btn btn-primary">
                月額300円でアップグレード
              </a>
              <p><small>いつでも解約可能</small></p>
            </div>
          </div>
        ` : ''}
        
        <div class="alternative-solutions">
          <h6>または以下の方法もご利用いただけます</h6>
          <div class="solution-option">
            <h7>既存植物に記録を追加</h7>
            <p>新規植物を登録せずに、既存の植物に育成記録を追加することができます。「既存の植物に育成記録を追加」を選択してください。</p>
          </div>
          <div class="solution-option">
            <h7>不要な植物記録の削除</h7>
            <p>使用していない植物記録を削除することで、新しい植物を登録できるようになります。</p>
          </div>
        </div>
        
        <div class="contact-suggestion">
          <p>ご不明な点がございましたら<a href="/pages/contact" target="_blank">お問い合わせ</a>ください。</p>
        </div>
      </div>
    `;
  }

  handleSubmissionError(data) {
    const statusDiv = document.getElementById('form-status');
    
    statusDiv.innerHTML = `
      <div class="error-message">
        <h4>処理中にエラーが発生しました</h4>
        <div class="error-details">
          <p><strong>エラー内容:</strong> ${data.error}</p>
          ${data.error_code ? `<p><strong>エラーコード:</strong> ${data.error_code}</p>` : ''}
        </div>
        
        <div class="error-troubleshooting">
          <h6>対処方法:</h6>
          <ul>
            <li>入力内容に問題がないか確認してください</li>
            <li>画像ファイルが10MB以下か確認してください</li>
            <li>インターネット接続を確認してください</li>
            <li>少し時間をおいて再試行してください</li>
          </ul>
        </div>
        
        <div class="error-actions">
          <button onclick="document.getElementById('form-status').innerHTML=''" class="btn btn-secondary btn-small">
            エラーを閉じる
          </button>
          <a href="/pages/contact" class="btn btn-primary btn-small" target="_blank">
            サポートに連絡
          </a>
        </div>
      </div>
    `;
  }

  async submitFollowUp(postId) {
  const textArea = document.getElementById(`follow-up-text-${postId}`);
  const followUpText = textArea?.value?.trim();
  
  if (!followUpText) {
    this.showTemporaryNotification('相談内容を入力してください', 'error');
    return;
  }
  if (followUpText.length > 1000) {
    this.showTemporaryNotification('相談内容は1000文字以内で入力してください', 'error');
    return;
  }

  try {
    const button = document.querySelector(`#follow-up-section-${postId} button`);
    const originalText = button?.textContent || '';
    if (button) { button.disabled = true; button.textContent = '分析中...'; }

    // ▼▼ ここで “方向性ヒント” を生成（現在開いているスレッドの植物名＋追記テキスト）
    const hint = this.classifyScene({
      plantName: this.currentOpenThread?.plant_name || '',
      consultationRequest: followUpText,
      notes: ''
    });

    const response = await fetch(`${this.apiBase}?action=follow_up_consultation`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        user_email: this.userEmail,
        entitlement: this.entitlement,
        entitlement_snapshot: this.entitlementSnapshot,
        consultation_post_id: postId,
        consultation_text: followUpText,
        current_season: this.seasonInfo,

        // ▼▼ 追記：Edge へ渡すヒント
        scene_hint: {
          scene: hint.scene,
          confidence: hint.confidence,
          plant_type: hint.plantType
        },
        // “わからない”で終わらせないためのビジョン誘導（軽量版）
        vision_guidance:
          '写真とテキストの両方を根拠に、可能性の高い候補(1〜3)と根拠（葉形/刺/ロゼット/気根/葉脈/棘座/肉厚/模様/花序など）を簡潔に。完全不明で終わらない。断定は避け、観察ポイントも1行添える。'
      })
    });

    const data = await response.json();

    if (data.success) {
      textArea.value = '';
      
      const followUpsList = document.getElementById(`follow-ups-list-${postId}`);
      if (followUpsList) {
        const followUpItem = document.createElement('div');
        followUpItem.className = 'follow-up-item';
        followUpItem.innerHTML = `
          <div class="follow-up-header">
            <span class="sequence">追加相談 ${data.sequence_number}/5</span>
            <span class="timestamp">${new Date().toLocaleString('ja-JP')}</span>
          </div>
          <div class="follow-up-question"><strong>質問:</strong> ${this.escapeHtml(followUpText)}</div>
          <div class="follow-up-answer"><strong>AI回答:</strong> ${this.formatResponse(data.ai_response)}</div>
          <div class="follow-up-season-info"><small>回答時の季節: ${this.seasonInfo.displayText}</small></div>
        `;
        followUpsList.appendChild(followUpItem);
      }

      const sectionHeader = document.querySelector(`#follow-up-section-${postId} h5`);
      if (sectionHeader) sectionHeader.textContent = `この記録について追加で相談する (${data.sequence_number}/5)`;

      if (data.remaining_consultations === 0) {
        const followUpForm = document.querySelector(`#follow-up-section-${postId} .follow-up-form`);
        if (followUpForm) {
          followUpForm.innerHTML = `
            <div class="follow-up-limit-reached">
              <p class="limit-reached">この記録への追加相談は5回に達しました</p>
              <div class="follow-up-limit-reached-info"><p><small>新しい投稿で再度5回まで追加相談できます</small></p></div>
            </div>`;
        }
      }

      this.showTemporaryNotification(`追加相談 ${data.sequence_number}/5 を送信しました`, 'success');

    } else if (data.error === 'follow_up_limit_reached') {
      this.showTemporaryNotification('この記録への追加相談は5回に達しました', 'error');
    } else {
      throw new Error(data.error || '追加相談に失敗しました');
    }

  } catch (error) {
    console.error('追加相談エラー:', error);
    this.showTemporaryNotification(`追加相談に失敗: ${error.message}`, 'error');
  } finally {
    const button = document.querySelector(`#follow-up-section-${postId} button`);
    if (button) { button.disabled = false; button.textContent = '追加相談する'; }
  }
}


async loadExistingPlantsForSelection() {
  const membershipType = this.getMembershipType();
  if (membershipType === 'non_member') {
    console.log('非会員のため植物データ読み込みスキップ');
    return;
  }

  try {
    console.log('既存植物選択用データ読み込み開始');
    console.log('APIリクエスト:', {
      userEmail: this.userEmail,
      entitlement: this.entitlement
    });

    console.log('⏳ fetch開始...');
    console.log('エンドポイント:', `${this.apiBase}?action=threads`);
    
    const response = await fetch(`${this.apiBase}?action=threads`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ 
        user_email: this.userEmail,
        entitlement: this.entitlement,
        entitlement_snapshot: this.entitlementSnapshot
      })
    });

    console.log('✅ fetch完了');
    console.log('APIレスポンス受信:', response.status, response.statusText);
    console.log('response.ok:', response.ok);

    if (!response.ok) {
      console.error('❌ HTTPエラー:', response.status, response.statusText);
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    console.log('⏳ JSONパース開始...');
    const data = await response.json();
    console.log('✅ JSONパース完了');
    console.log('APIレスポンスデータ:', data);
    console.log('取得したスレッド数:', (data.threads || []).length);
    
    this.existingPlants = data.threads || [];
    console.log('this.existingPlants に格納:', this.existingPlants.length + '件');
    
    this.updateExistingPlantsDropdown();
    
    console.log('🎉🎉🎉 既存植物リスト更新完了:', this.existingPlants.length + '件 🎉🎉🎉');
    
    return this.existingPlants;

  } catch (error) {
    console.error('❌❌❌ 既存植物一覧の取得に失敗:', error);
    console.error('エラーメッセージ:', error.message);
    console.error('エラースタック:', error.stack);
    
    this.existingPlants = [];
    const select = document.getElementById('existing-plant-select');
    if (select) {
      select.innerHTML = '<option value="">読み込みに失敗しました</option>';
    }
    
    return [];
  }
}

  updateExistingPlantsDropdown() {
    const select = document.getElementById('existing-plant-select');
    if (!select) return;

    if (this.existingPlants.length === 0) {
      select.innerHTML = '<option value="">まだ植物記録がありません</option>';
      return;
    }

    const sortedPlants = [...this.existingPlants].sort((a, b) => 
      new Date(b.updated_at) - new Date(a.updated_at)
    );

    const options = sortedPlants.map(thread => {
      const lastUpdate = this.calculateDaysSince(thread.updated_at);
      const activityStatus = this.getActivityLevel(lastUpdate).text;
      
      return `<option value="${thread.id}" 
                     data-plant-name="${this.escapeHtml(thread.plant_name)}"
                     data-posts-count="${thread.posts_count || 0}"
                     data-activity="${activityStatus}">
        ${this.escapeHtml(thread.plant_name)} 
        (記録${thread.posts_count || 0}件・${activityStatus})
      </option>`;
    }).join('');

    select.innerHTML = `
      <option value="">植物を選択してください</option>
      ${options}
    `;
  }

async loadUserThreads() {
  const container = document.getElementById('threads-list');
  if (!container) return;

  const membershipType = this.getMembershipType();
  if (membershipType === 'non_member') return;

  try {
    console.log('スレッド読み込み開始');

    const response = await fetch(`${this.apiBase}?action=threads`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ 
        user_email: this.userEmail,
        entitlement: this.entitlement,
        entitlement_snapshot: this.entitlementSnapshot,
    membership_type: this.getMembershipType()  
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    console.log('スレッド取得成功:', (data.threads || []).length + '件');

    // ★ 追加: existingPlants を更新
    this.existingPlants = data.threads || [];
    
    this.renderThreadsList(data.threads || [], membershipType);
    

    } catch (error) {
      console.error('記録の読み込みに失敗:', error);
      container.innerHTML = `
        <div class="error-message">
          <h4>接続エラー</h4>
          <p>植物記録の読み込みに失敗しました。</p>
          <div class="error-details">
            <p><strong>エラー:</strong> ${error.message}</p>
          </div>
          <div class="error-actions">
            <button onclick="window.plantApp.loadUserThreads()" class="btn btn-small btn-secondary">
              再読み込み
            </button>
            <a href="/pages/contact" class="btn btn-small btn-primary" target="_blank">
              サポートに連絡
            </a>
          </div>
        </div>
      `;
    }
  }

  renderThreadsList(threads, membershipType) {
    const container = document.getElementById('threads-list');
    if (!container) return;

    const plantLimits = {
      free_member: 20,
      paid_member: 50
    };
    const currentLimit = plantLimits[membershipType] || 0;

    if (!threads.length) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🌱</div>
          <h4>まだ植物記録がありません</h4>
          <p>最初の育成記録投稿で、植物の育成記録を始めましょう！</p>
          <div class="empty-state-features">
            <p><strong>利用可能な機能:</strong></p>
            <ul>
              <li>育成記録は無制限で投稿できます</li>
              <li>相談内容を空にすると「記録のみ」投稿も可能</li>
              <li>各記録に対して5回まで追加相談</li>
              <li>植物は${currentLimit}個まで登録可能</li>
              <li>${this.seasonInfo.displayText}の季節情報を考慮した分析</li>
            </ul>
          </div>
        </div>
      `;
      return;
    }

    const limitWarning = threads.length >= currentLimit * 0.8;

    container.innerHTML = `
      ${limitWarning ? `
        <div class="plant-count-info ${threads.length >= currentLimit ? 'limit-reached' : ''}">
          <div class="count-display">
            <span class="count-text">登録植物: ${threads.length}/${currentLimit}個</span>
            <span class="season-info-small">${this.seasonInfo.displayText}</span>
          </div>
          ${threads.length >= currentLimit ? `
            <div class="limit-reached-notice">
              <p><strong>植物登録上限に達しました</strong></p>
              <p>新しい植物を登録するには、既存の植物記録を削除するか、<a href="/products/leafla-subscription">有料会員にアップグレード</a>してください。</p>
            </div>
          ` : threads.length >= currentLimit * 0.9 ? `
            <div class="limit-warning-notice">
              <p><strong>植物登録上限が近づいています</strong></p>
              <p>あと${currentLimit - threads.length}個まで登録可能です。</p>
            </div>
          ` : ''}
        </div>
      ` : ''}
      
      <div class="threads-grid">
        ${threads.map((thread, index) => this.renderThreadCard(thread, index, membershipType)).join('')}
      </div>
    `;
  }

renderThreadCard(thread, index, membershipType) {
  const lastUpdateDays = this.calculateDaysSince(thread.updated_at);
  const totalImages = thread.total_images || 0;
  
  return `<div class="plant-record-card unlimited" 
         data-thread-id="${thread.id}">
      
      <div class="plant-header">
        <div class="plant-info" onclick="window.plantApp.openPlantRecord('${thread.id}', ${index})">
          <h4 class="plant-name">${this.escapeHtml(thread.plant_name)}</h4>
          <p class="plant-dates">
            記録開始: ${this.formatDate(thread.created_at)}
            ${lastUpdateDays > 0 ? `<br>最終更新: ${lastUpdateDays}日前` : ''}
          </p>
        </div>
        <div class="plant-stats">
          <span class="post-count unlimited">
            育成記録: ${thread.posts_count || 0}件
          </span>
          ${totalImages > 0 ? `
            <span class="image-count">
              📸 ${totalImages}枚
            </span>
          ` : ''}
          <span class="unlimited-badge">無制限</span>

        </div>
      </div>

      <div onclick="window.plantApp.openPlantRecord('${thread.id}', ${index})">
        ${thread.cover_image_url ? `
          <div class="plant-cover-image">
            <img src="${thread.cover_image_url}" 
                 alt="${this.escapeHtml(thread.plant_name)}" 
                 class="cover-img"
                 loading="lazy">
          </div>
        ` : `
          <div class="plant-cover-placeholder">
            <div class="placeholder-icon">${this.getPlantEmoji(thread.plant_name)}</div>
            <span class="placeholder-text">育成記録</span>
            <span class="season-context">${this.seasonInfo.displayText}管理中</span>
          </div>
        `}

        <div class="plant-actions">
          <span class="action-hint">クリックして記録を見る</span>
          <div class="plant-features">
            <p class="unlimited-note">
              育成記録無制限・追加相談は各記録に5回まで・記録のみ投稿も可能
            </p>
            ${membershipType === 'paid_member' ? `
              <p class="premium-features">
                <small>ケア通知・イラスト生成対応</small>
              </p>
            ` : ''}
          </div>
        </div>

        <div class="plant-quick-stats">
          <div class="stat-item">
            <span class="stat-label">活動度</span>
            <span class="stat-value ${this.getActivityLevel(lastUpdateDays).class}">
              ${this.getActivityLevel(lastUpdateDays).text}
            </span>
          </div>
          <div class="stat-item">
            <span class="stat-label">季節適応</span>
            <span class="stat-value seasonal">
              ${this.seasonInfo.seasonName}対応
            </span>
          </div>
        </div>
      </div>

    </div>`;
}
calculateDaysSince(dateString) {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
  } catch (error) {
    return 0;
  }
}

// === BEGIN PATCH: getLatestThreadImage 追加/置換 ===
async getLatestThreadImage(threadId) {
  try {
    if (!threadId) return null;

    const res = await fetch(`${this.apiBase}?action=growth_images`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(this.getCommonPayload({ thread_id: threadId }))
    });

    if (!res.ok) {
      console.warn('growth_images HTTP error:', res.status);
      return null;
    }

    const data = await res.json().catch(() => ({}));
    // 期待する形: { images: [{ url: '...' }, ...] }
    const url = data?.images?.[0]?.url || data?.latest_image_url || null;
    return url;
  } catch (e) {
    console.error('getLatestThreadImage 例外:', e);
    return null;
  }
}
// === END PATCH ===





  getActivityLevel(daysSince) {
    if (daysSince <= 7) {
      return { text: 'アクティブ', class: 'active' };
    } else if (daysSince <= 30) {
      return { text: '通常', class: 'normal' };
    } else {
      return { text: '休眠中', class: 'inactive' };
    }
  }

  getPlantEmoji(plantName) {
    const name = plantName.toLowerCase();
    if (name.includes('ビカクシダ') || name.includes('リドレイ')) return '🦇';
    if (name.includes('多肉') || name.includes('サボテン')) return '🌵';
    if (name.includes('蘭') || name.includes('orchid')) return '🌺';
    if (name.includes('ポトス') || name.includes('フィロデンドロン')) return '🌿';
    if (name.includes('モンステラ')) return '🍃';
    if (name.includes('サンセベリア')) return '🗡️';
    return '🌱';
  }

  async openPlantRecord(threadId, threadIndex) {
    try {
    this.openedFromSNS = false;
    this.returnToPostDetail = false;
    this.currentPostId = null;
    console.log('📌 通常の植物一覧から開きました');
      let threadData;
      if (threadIndex !== undefined && this.existingPlants[threadIndex]) {
        threadData = this.existingPlants[threadIndex];
      } else {
        const threadsResponse = await fetch(`${this.apiBase}?action=threads`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            user_email: this.userEmail,
            entitlement: this.entitlement,
            entitlement_snapshot: this.entitlementSnapshot 
          })
        });
        const threadsData = await threadsResponse.json();
        threadData = (threadsData.threads || []).find(t => t.id === threadId);
      }
      
      if (!threadData) {
        this.showErrorModal('植物データの読み込みに失敗しました');
        return;
      }
      
      this.currentOpenThread = threadData;
      this.showLoadingModal('植物記録を読み込み中...');
      
      const posts = await this.loadThreadPosts(threadId);
      this.closeLoadingModal();
      this.renderAdvancedPlantRecordModal(threadData, posts);
      this.loadModalAdditionalData(threadId);
      
    } catch (error) {
      this.closeLoadingModal();
      this.showErrorModal('植物記録の表示に失敗しました: ' + error.message);
      console.error('植物記録表示エラー:', error);
    }
  }
  
backToPlantList() {
  console.log('🔙 一覧へ戻る:', { 
    openedFromSNS: this.openedFromSNS
  });
  
  // 植物詳細モーダルを閉じる
  const plantRecordModal = document.getElementById('plant-record-modal');
  if (plantRecordModal) {
    plantRecordModal.remove();
    console.log('✅ plant-record-modal を削除しました');
  }
  
  // ★ 残っているすべてのモーダルオーバーレイを削除
  const modals = document.querySelectorAll('.modal-overlay');
  modals.forEach(modal => {
    modal.remove();
    console.log('✅ 残っていたモーダルを削除しました');
  });
  
  // ★ SNSから開いた場合はSNS一覧に戻る
  if (this.openedFromSNS === true) {
    console.log('📌 SNS一覧に戻ります');
    this.openedFromSNS = false;
    this.openSNSFeed();
    return;
  }
  
  // ★ 通常の植物一覧から開いた場合
  console.log('📌 植物一覧に戻ります');
  
  // popoverを開く
  const brUserPopover = document.getElementById('brUserPopover');
  const brUserBtn = document.getElementById('brUserBtn');
  if (brUserPopover && brUserBtn) {
    brUserPopover.hidden = false;
    brUserBtn.setAttribute('aria-expanded', 'true');
    console.log('✅ メニューを開きました');
  }
  
  console.log('植物一覧に戻りました');
}

renderAdvancedPlantRecordModal(threadData, posts) {
  console.log('📌 renderAdvancedPlantRecordModal 開始時:', this.openedFromSNS);

  this.closeAllModals();
  const membershipType = this.getMembershipType();

  const modalHtml = `
    <div id="plant-record-modal" class="modal-overlay" onclick="window.plantApp.closeRecordModal(event)">
      <div class="modal-content plant-record-content" onclick="event.stopPropagation()">
        
        <div class="modal-header">
          <button onclick="window.plantApp.backToPlantList()" class="back-to-list-btn" type="button">< 戻る</button>
          <div class="header-main">
            <h3>${this.escapeHtml(threadData.plant_name)} の育成記録</h3>
            <div class="header-badges">
              <span class="unlimited-badge">記録無制限</span>
              <span class="season-badge">${this.seasonInfo.displayText}</span>
              ${membershipType === 'paid_member' ? '<span class="premium-badge">プレミアム</span>' : ''}
            </div>
          </div>
          <div class="record-info">
            <span>${posts.length}件の育成記録 | ${this.formatDate(threadData.created_at)}〜</span>
            <span>最終更新: ${this.formatDate(threadData.updated_at)}</span>
          </div>
          <button onclick="window.plantApp.closeAllModals()" class="close-btn">× 閉じる</button>
          <button class="delete-thread-btn" 
                  onclick="event.stopPropagation(); window.plantApp.deleteThread('${threadData.id}')"
                  title="この植物の記録を削除">植物の記録を削除</button>
        </div>

        <div class="modal-body">
          
          <div class="tab-navigation advanced">
            <button class="tab-btn active" data-tab="timeline">
              <span class="tab-icon">📝</span>
              <span class="tab-label">育成記録履歴</span>
            </button>
            <button class="tab-btn" data-tab="growth-comparison">
              <span class="tab-icon">📈</span>
              <span class="tab-label">成長比較</span>
            </button>
            <button class="tab-btn" data-tab="care-log">
              <span class="tab-icon">🗓️</span>
              <span class="tab-label">ケア記録</span>
            </button>
            ${this.shouldShowCareAlertsTab(threadData, posts) ? `
              <button class="tab-btn" data-tab="care-alerts">
                <span class="tab-icon">🔔</span>
                <span class="tab-label">ケア通知</span>
              </button>
            ` : ''}
          </div>

          <div class="tab-contents">
            
            <div class="tab-content active" data-tab="timeline">
              ${this.renderAdvancedTimelineTab(posts)}
            </div>

            <div class="tab-content" data-tab="growth-comparison">
              ${this.renderGrowthComparisonTab(threadData.id)}
            </div>

            <div class="tab-content" data-tab="care-log">
              ${this.renderAdvancedCareLogTab(threadData)}
            </div>
            ${this.shouldShowCareAlertsTab(threadData, posts) ? `
              <div class="tab-content" data-tab="care-alerts">
                ${this.renderCareAlertsTab(threadData.id)}
              </div>
            ` : ''}
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', modalHtml);
  this.attachAdvancedTabEvents();
  document.addEventListener('keydown', this.handleEscapeKey.bind(this));
}

shouldShowCareAlertsTab(threadData, posts) {
  // 投稿者が自分の場合は、自分の会員種別で判定
  if (threadData.is_owner !== false) {
    const membershipType = this.getMembershipType();
    return membershipType === 'paid_member';
  }
  
  // 他のユーザーの投稿の場合
  // 投稿数が多い場合は有料会員と推測（暫定的な判定）
  // ★ より正確には、投稿者の会員種別をバックエンドから取得すべき
  return posts.length > 5;
}

async loadModalAdditionalData(threadId) {
    console.log('📌 loadModalAdditionalData 開始時:', this.openedFromSNS);

  const promises = [
    this.loadCareRecords(threadId),
    this.loadGrowthImages(threadId)
  ];
  
  // ★★★ ケア通知データの読み込み条件 ★★★
  const careAlertsTab = document.querySelector('[data-tab="care-alerts"]');
  if (careAlertsTab) {
    const membershipType = this.getMembershipType();
    const isOwner = this.currentOpenThread?.is_owner !== false;
    
    // 自分の植物 & 無料会員の場合は読み込まない（訴求画面を維持）
    // それ以外の場合はケア通知データを読み込む
    if (!(isOwner && membershipType !== 'paid_member')) {
      promises.push(this.loadCareAlerts(threadId));
    }
  }
  
  try {
    await Promise.all(promises);
    console.log('モーダル追加データ読み込み完了');
  } catch (error) {
    console.error('モーダル追加データ読み込みエラー:', error);
  }
}

  // ★ ここから置き換え
  renderAdvancedTimelineTab(posts, noLimit = false) {
  const membershipType = this.getMembershipType();
    if (!posts.length) {
      return `<div class="empty-content">
          <div class="empty-icon">📝</div>
          <h5>まだ育成記録がありません</h5>
          <div class="empty-suggestions">
            <p>育成記録は無制限で投稿できます</p>
            <ul>
              <li>相談内容を空にすると「記録のみ」投稿が可能</li>
              <li>各記録に対して5回まで追加相談できます</li>
              <li>季節に応じたアドバイスを受けられます</li>
            </ul>
          </div>
        </div>`;
    }

    const MAX_INITIAL = 30; // ← 初期表示件数（必要なら増減してOK）
    const visiblePosts = noLimit ? posts : posts.slice(0, MAX_INITIAL);
    const hasMore = !noLimit && posts.length > MAX_INITIAL;

    const recordOnlyCount = posts.filter(p => !p.consultation_request).length;
    const consultationCount = posts.length - recordOnlyCount;

    return `<div class="timeline-content advanced">
        <div class="timeline-header">
          <h5>育成記録タイムライン</h5>
          <div class="timeline-stats">
            <span class="stat">全${posts.length}件</span>
            <span class="stat">記録のみ: ${recordOnlyCount}件</span>
            <span class="stat">相談: ${consultationCount}件</span>
          </div>
        </div>

        ${visiblePosts.map((post, index) => `
          <div class="timeline-item advanced ${!post.consultation_request ? 'record-only' : 'consultation'}">
            <div class="timeline-marker">
              <span class="marker-icon">${!post.consultation_request ? '📝' : '💡'}</span>
              <span class="marker-number">${posts.length - index}</span>
            </div>

            <div class="timeline-content-body">
<div class="timeline-date">
  <span class="date-text">${this.formatDateTime(post.created_at)}</span>
  
  ${this.currentOpenThread.is_owner !== false ? `
    <div class="timeline-actions">
      ${membershipType !== 'non_member' ? `
        <button onclick="window.plantApp.togglePostVisibility('${post.id}', ${post.is_public || false})" 
                class="btn-visibility" 
                title="公開設定を変更">
          ${post.is_public ? '🔓 公開中' : '🔒 非公開'}
        </button>
      ` : ''}
      
      <button onclick="window.plantApp.confirmDeletePost('${post.id}', '${this.currentOpenThread?.id || ''}')" 
              class="btn-delete" 
              title="この投稿を削除">
        🗑️ 削除
      </button>
    </div>
  ` : ''}
</div>
              
              <div class="post-content">
                ${post.consultation_request ? `
                  <div class="consultation-section">
                    <h6>相談内容</h6>
                    <p>${this.escapeHtml(post.consultation_request)}</p>
                  </div>
                ` : `
                  <div class="record-only-section">
                    <h6>記録のみ投稿</h6>
                    <p class="record-only-note">AI分析なしの記録専用投稿</p>
                  </div>
                `}

                ${post.notes ? `
                  <div class="notes-section">
                    <h6>記録・備考</h6>
                    <p>${this.escapeHtml(post.notes)}</p>
                  </div>
                ` : ''}
                
                ${post.ai_response && post.ai_response.trim() !== '' ? `
                  <div class="response-section">
                    <h6>AI分析結果</h6>
                    <div class="ai-response">${this.formatResponse(post.ai_response)}</div>
                  </div>
                ` : ''}
                
                <div class="media-section">
                  ${post.input_image_url ? `
                    <div class="post-image">
                      <img src="${post.input_image_url}" alt="投稿写真" 
                           onclick="window.plantApp.showImageFullscreen('${post.input_image_url}', '投稿写真 ${this.formatDate(post.created_at)}')"
                           loading="lazy">
                    </div>
                  ` : ''}

                  ${post.ai_generated_image_url ? `
                    <div class="generated-image">
                      <h7>生成イラスト</h7>
                      <img src="${post.ai_generated_image_url}" alt="ケアイラスト" 
                           onclick="window.plantApp.showImageFullscreen('${post.ai_generated_image_url}', 'ケアイラスト ${this.formatDate(post.created_at)}')"
                           loading="lazy">
                    </div>
                  ` : ''}
                </div>

<div class="post-footer">
  <div class="follow-up-count">
    <span class="count-badge">追加相談: ${post.follow_up_count || 0}/5回</span>
    ${this.currentOpenThread?.is_owner !== false ? 
      ((post.follow_up_count || 0) < 5 ? 
        `<button onclick="window.plantApp.showFollowUpModal('${post.id}')" class="btn btn-small btn-secondary">
          追加相談
        </button>` :
        '<span class="limit-reached">上限到達</span>'
      ) : 
      '<span class="other-user-post">閲覧のみ</span>'
    }
  </div>
</div>
              </div>
            </div>
          </div>
        `).join('')}

        ${hasMore ? `
          <div class="timeline-load-more">
            <button class="btn btn-secondary btn-small"
                    onclick="window.plantApp.loadMoreTimeline('${this.currentOpenThread?.id || ''}')">
              さらに表示（残り${posts.length - MAX_INITIAL}件）
            </button>
          </div>
        ` : ''}
      </div>`;
  }
  // ★ ここまで置き換え
  async loadMoreTimeline(threadId) {
    try {
      if (!threadId && this.currentOpenThread) {
        threadId = this.currentOpenThread.id;
      }
      if (!threadId) return;

      const posts = await this.loadThreadPosts(threadId);
      const timelineContent = document.querySelector('[data-tab="timeline"].tab-content');
      if (!timelineContent) return;

      // 今度は noLimit = true で全件表示
      timelineContent.innerHTML = this.renderAdvancedTimelineTab(posts, true);
    } catch (e) {
      console.error('タイムライン追加読み込みエラー:', e);
      this.showTemporaryNotification('育成記録の読み込みに失敗しました', 'error');
    }
  }


  attachAdvancedTabEvents() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    
    tabButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const targetTab = btn.getAttribute('data-tab');
        
        tabButtons.forEach(b => b.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));
        
        btn.classList.add('active');
        const targetContent = document.querySelector(`[data-tab="${targetTab}"].tab-content`);
        if (targetContent) {
          targetContent.classList.add('active');
        }

        console.log('タブ切り替え:', targetTab);
      });
    });
  }

  closeRecordModal(event) {
    if (event.target.id === 'plant-record-modal') {
      this.closeAllModals();
      this.currentOpenThread = null;
    }
  }

  handleEscapeKey(event) {
    if (event.key === 'Escape') {
      this.closeAllModals();
      this.currentOpenThread = null;
    }
  }

  async loadThreadPosts(threadId) {
    try {
      console.log('投稿履歴読み込み開始:', threadId);
　　　　
      const response = await fetch(`${this.apiBase}?action=thread_posts`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ 
          user_email: this.userEmail,
          entitlement: this.entitlement,
          entitlement_snapshot: this.entitlementSnapshot,
          thread_id: threadId
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('投稿履歴取得成功:', (data.posts || []).length + '件');
      
      return data.posts || [];

    } catch (error) {
      console.error('投稿履歴の取得に失敗:', error);
      throw error;
    }
  }

  async showFollowUpModal(postId) {
    console.log('追加相談モーダル表示開始:', postId);
    this.closeAllModals();
    this.loadPostForFollowUp(postId);
  }

async loadPostForFollowUp(postId) {
  try {
    // まず現在のスレッドから投稿を検索
    const response = await fetch(`${this.apiBase}?action=thread_posts`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        user_email: this.userEmail,
        entitlement: this.entitlement,
        entitlement_snapshot: this.entitlementSnapshot,
        thread_id: this.currentOpenThread?.id || ''
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const post = data.posts?.find(p => p.id === postId);
    
    if (!post) {
      throw new Error('投稿が見つかりません');
    }

    // 植物名の確保（フォールバック処理）
    const plantName = post.plant_name || 
                     data.thread_info?.plant_name || 
                     this.currentOpenThread?.plant_name || 
                     '植物';

    // postオブジェクトに植物名を確実に設定
    const enrichedPost = {
      ...post,
      plant_name: plantName
    };

    this.renderFollowUpModal(enrichedPost);
    
  } catch (error) {
    console.error('投稿情報取得エラー:', error);
    this.showTemporaryNotification('投稿情報の取得に失敗しました', 'error');
  }
}

  renderFollowUpModal(post) {
    const modalHtml = `
      <div id="follow-up-modal" class="modal-overlay" onclick="event.stopPropagation()">
        <div class="modal-content follow-up-modal" onclick="event.stopPropagation()">
          <div class="modal-header">
            <h3>追加相談</h3>
            <div class="post-context">
              <small>「${this.escapeHtml(post.plant_name || '')}」について追加で質問</small>
            </div>
            <button onclick="window.plantApp.closeAllModals()" class="close-btn">×</button>
          </div>
          
          <div class="modal-body">
            <div class="original-post-summary">
              <h5>元の相談内容</h5>
              <div class="post-content">
                ${post.consultation_request ? `
                  <div class="consultation-section">
                    <strong>相談内容:</strong>
                    <p>${this.escapeHtml(post.consultation_request)}</p>
                  </div>` : ''}
                
                ${post.notes ? `
                  <div class="notes-section">
                    <strong>記録・備考:</strong>
                    <p>${this.escapeHtml(post.notes)}</p>
                  </div>
                ` : ''}
                
                ${post.ai_response ? `
                  <div class="ai-response-section">
                    <strong>AI回答:</strong>
                    <div class="response-content">${this.formatResponse(post.ai_response)}</div>
                  </div>
                ` : ''}
              </div>
            </div>
            
            <div class="follow-up-form-section">
              <h5>追加で質問したいこと</h5>
              <div class="form-group">
                <textarea id="follow-up-text-modal" 
                          placeholder="例:
- 他に気をつけることはありますか？
- どのくらいの頻度で行えばよいですか？
- 症状が改善されない場合はどうすればよいですか？
- ${this.seasonInfo.seasonName}による違いはありますか？" 
                          rows="4"></textarea>
                <div class="help-text">
                  <small>現在の季節（${this.seasonInfo.displayText}）を考慮した質問ができます</small>
                </div>
              </div>
              
              <div class="form-actions">
                <button onclick="window.plantApp.submitFollowUpFromModal('${post.id}')" 
                        class="btn btn-primary" id="follow-up-submit-btn">
                  追加相談を送信
                </button>
                <button onclick="window.plantApp.closeAllModals()" class="btn btn-secondary">
                  キャンセル
                </button>
              </div>
            </div>
            
            <div class="follow-up-history-section">
              <h5>追加相談履歴</h5>
              <div id="follow-ups-list-modal-${post.id}" class="follow-ups-list">
                <div class="loading">履歴を読み込み中...</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    this.loadFollowUpHistory(post.id);
    
    const handleEscKey = (e) => {
      if (e.key === 'Escape') {
        this.closeAllModals();
        document.removeEventListener('keydown', handleEscKey);
      }
    };
    document.addEventListener('keydown', handleEscKey);
  }

  async loadFollowUpHistory(postId) {
    try {
      const response = await fetch(`${this.apiBase}?action=get_follow_ups`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          user_email: this.userEmail,
          entitlement: this.entitlement,
        entitlement_snapshot: this.entitlementSnapshot,
          consultation_post_id: postId
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.success && data.follow_ups) {
        this.renderFollowUpHistory(postId, data.follow_ups);
      } else {
        this.renderFollowUpHistory(postId, []);
      }
      
    } catch (error) {
      console.error('追加相談履歴読み込みエラー:', error);
      this.renderFollowUpHistory(postId, []);
    }
  }
renderFollowUpHistory(postId, history) {
  const container = document.getElementById(`follow-ups-list-modal-${postId}`);
  if (!container) return;

  if (!history.length) {
    container.innerHTML = `
      <div class="no-follow-ups">
        <p>まだ追加相談はありません</p>
        <p><small>この投稿について追加で質問したいことを入力してください</small></p>
      </div>
    `;
    return;
  }

  container.innerHTML = history.map((followUp, index) => `
    <div class="follow-up-item">
      <div class="follow-up-header">
        <span class="sequence">追加相談 ${followUp.sequence_number}/5</span>
        <span class="timestamp">${this.formatDateTime(followUp.created_at)}</span>
      </div>
      <div class="follow-up-question">
        <strong>質問:</strong> ${this.escapeHtml(followUp.consultation_text)}
      </div>
      <div class="follow-up-answer">
        <strong>AI回答:</strong> ${this.formatResponse(followUp.ai_response)}
      </div>
    </div>
  `).join('');

  // ★ 追加：最新の追加相談までスクロール
  if (history.length > 0) {
    setTimeout(() => {
      const lastItem = container.querySelector('.follow-up-item:last-child');
      if (lastItem) {
        lastItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }, 100);
  }
}

 async submitFollowUpFromModal(postId) {
  const textArea = document.getElementById('follow-up-text-modal');
  const followUpText = textArea?.value?.trim();
  if (!followUpText) {
    this.showTemporaryNotification('相談内容を入力してください', 'error');
    return;
  }
  if (followUpText.length > 1000) {
    this.showTemporaryNotification('相談内容は1000文字以内で入力してください', 'error');
    return;
  }

  try {
    const submitBtn = document.getElementById('follow-up-submit-btn');
    const originalText = submitBtn?.textContent || '';
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = '送信中...'; }

    // ▼▼ ここで “方向性ヒント” を生成（モーダルの追記テキスト）
    const hint = this.classifyScene({
      plantName: this.currentOpenThread?.plant_name || '',
      consultationRequest: followUpText,
      notes: ''
    });

    const response = await fetch(`${this.apiBase}?action=follow_up_consultation`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        user_email: this.userEmail,
        entitlement: this.entitlement,
        entitlement_snapshot: this.entitlementSnapshot,
        consultation_post_id: postId,
        consultation_text: followUpText,
        current_season: this.seasonInfo,

        // ▼▼ 追記：Edge へ渡すヒント
        scene_hint: {
          scene: hint.scene,
          confidence: hint.confidence,
          plant_type: hint.plantType
        },
        vision_guidance:
          '写真とテキストの両方を根拠に、可能性の高い候補(1〜3)と根拠を簡潔に示す。完全不明で終わらない。観察すべき部位も1行添える。'
      })
    });

    const data = await response.json();
if (!response.ok || !data.success) {
  if (data.error === 'consultation_limit_reached') {
    this.showConsultationLimitModal(data);
    return;
  }
  throw new Error(data.error || '追加相談に失敗しました');
}

if (!response.ok || !data.success) {
  if (data.error === 'consultation_limit_reached') {
    this.showConsultationLimitModal(data);
    return;
  }
  throw new Error(data.error || '追加相談に失敗しました');
}
    if (data.success) {
      textArea.value = '';
      this.showTemporaryNotification(`追加相談 ${data.sequence_number}/5 を送信しました`, 'success');

      await this.loadFollowUpHistory(postId);
      this.updateMainFollowUpSection(postId, data);

  if (this.currentOpenThread?.id) {
    await this.loadThreadPosts(this.currentOpenThread.id);
  }

  if (data.remaining_consultations === 0) {
    setTimeout(() => { this.closeAllModals(); }, 2000);
  }
    } else {
      throw new Error(data.error || '追加相談に失敗しました');
    }

  } catch (error) {
    console.error('追加相談送信エラー:', error);
    this.showTemporaryNotification(`追加相談に失敗: ${error.message}`, 'error');
  } finally {
    const submitBtn = document.getElementById('follow-up-submit-btn');
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '追加相談を送信'; }
  }
}


  updateMainFollowUpSection(postId, data) {
    const mainFollowUpSection = document.getElementById(`follow-up-section-${postId}`);
    if (mainFollowUpSection) {
      const sectionHeader = mainFollowUpSection.querySelector('h5');
      if (sectionHeader) {
        sectionHeader.textContent = `この記録について追加で相談する (${data.sequence_number}/5)`;
      }
      
      if (data.remaining_consultations === 0) {
        const followUpForm = mainFollowUpSection.querySelector('.follow-up-form');
        if (followUpForm) {
          followUpForm.innerHTML = `
            <div class="follow-up-limit-reached">
              <p class="limit-reached">この記録への追加相談は5回に達しました</p>
              <div class="limit-reached-info">
                <p><small>新しい投稿をすることで、また5回まで追加相談できます</small></p>
              </div>
            </div>
          `;
        }
      }
    }
  }

  renderAdvancedCareLogTab(threadData) {
    return `<div class="care-log-content">
        <div class="care-log-header">
          <div class="header-info">
            <h4>ケア記録</h4>
            <p>水やり・肥料・植え替えなどのケア履歴を管理</p>
          </div>
<div class="header-actions">
  ${this.currentOpenThread?.is_owner !== false ? `
    <button onclick="window.plantApp.showAddCareModal('${threadData.id}')" class="btn btn-primary btn-small">
      + ケア記録を追加
    </button>
  ` : ''}
</div>
        </div>

        <div id="care-records-container">
          <div class="loading">ケア記録を読み込み中...</div>
        </div>
      </div>`;
  }

  async loadCareRecords(threadId) {
    const container = document.getElementById('care-records-container');
    if (!container) {
      console.error('care-records-container が見つかりません');
      return;
    }

    try {
      console.log('ケア記録読み込み開始:', threadId);

      const response = await fetch(`${this.apiBase}?action=get_care_records`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          user_email: this.userEmail,
          entitlement: this.entitlement,
        entitlement_snapshot: this.entitlementSnapshot,
          thread_id: threadId
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error);
      }

console.log('ケア記録取得成功:', data.records?.length || 0);
this.renderAdvancedCareRecordsList(data.records || []);

    } catch (error) {
      console.error('ケア記録読み込みエラー:', error);
      container.innerHTML = `
        <div class="error-message">
          <h5>ケア記録の読み込みに失敗</h5>
          <p>エラー: ${error.message}</p>
          <div class="error-actions">
            <button onclick="window.plantApp.loadCareRecords('${threadId}')" class="btn btn-small">
              再読み込み
            </button>
          </div>
        </div>
      `;
    }
  }

  renderAdvancedCareRecordsList(careRecords) {
    const container = document.getElementById('care-records-container');
    if (!container) return;

    if (!careRecords.length) {
      container.innerHTML = `
        <div class="no-care-records">
          <div class="empty-icon">📝</div>
          <h5>まだケア記録がありません</h5>
          <p>水やり・肥料などのケア記録を追加してみましょう！</p>
          <div class="care-benefits">
            <h6>ケア記録のメリット</h6>
            <ul>
              <li>ケア間隔の最適化</li>
              <li>植物の健康状態把握</li>
              <li>季節に応じたケア調整</li>
              <li>問題の早期発見</li>
            </ul>
          </div>
        </div>
      `;
      return;
    }

    const groupedRecords = this.groupCareRecordsByType(careRecords);
    
    container.innerHTML = `
      <div class="care-records-summary">
        <h5>ケア記録サマリー</h5>
        <div class="summary-stats">
          <div class="stat-item">
            <span class="stat-label">総記録数</span>
            <span class="stat-value">${careRecords.length}件</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">ケア種類</span>
            <span class="stat-value">${Object.keys(groupedRecords).length}種類</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">最終ケア</span>
            <span class="stat-value">${this.formatDate(careRecords[0]?.care_date)}</span>
          </div>
        </div>
      </div>

      <div class="care-records-by-type">
        ${Object.entries(groupedRecords).map(([careType, records]) => 
          this.renderCareTypeSection(careType, records)
        ).join('')}
      </div>
      
      <div class="care-records-timeline">
        <h5>すべてのケア記録</h5>
        <div class="records-list">
          ${careRecords.map(record => this.renderCareRecordItem(record)).join('')}
        </div>
      </div>
    `;
  }

  groupCareRecordsByType(records) {
    const grouped = {};
    records.forEach(record => {
      if (!grouped[record.care_type]) {
        grouped[record.care_type] = [];
      }
      grouped[record.care_type].push(record);
    });
    return grouped;
  }

  renderCareTypeSection(careType, records) {
    const latestRecord = records[0];
    const totalCount = records.length;
    const careInfo = this.careTypes[careType] || this.careTypes.other;
    
    return `<div class="care-type-section">
        <div class="care-type-header">
          <div class="care-type-info">
            <span class="care-icon">${careInfo.icon}</span>
            <h6>${careInfo.name}</h6>
          </div>
          <div class="care-type-stats">
            <span class="count">${totalCount}回</span>
            <span class="latest">最新: ${this.formatDate(latestRecord.care_date)}</span>
          </div>
        </div>
        <div class="recent-records">
          ${records.slice(0, 3).map(record => `
            <div class="mini-record">
              <span class="date">${this.formatDate(record.care_date)}</span>
              ${record.notes ? `<span class="note">${this.escapeHtml(record.notes.substring(0, 30))}${record.notes.length > 30 ? '...' : ''}</span>` : ''}
            </div>
          `).join('')}
          ${records.length > 3 ? `<div class="more-records">+${records.length - 3}件</div>` : ''}
        </div>
      </div>`;
  }

  renderCareRecordItem(record) {
    const careInfo = this.careTypes[record.care_type] || this.careTypes.other;
    
    return `<div class="care-record-item">
        <div class="care-header">
          <span class="care-info">
            <span class="care-icon">${careInfo.icon}</span>
            <span class="care-type">${careInfo.name}</span>
          </span>
          <span class="care-date">${this.formatDate(record.care_date)}</span>
        </div>
        ${record.notes ? `
          <div class="care-notes">
            <p>${this.escapeHtml(record.notes)}</p>
          </div>
        ` : ''}
        ${record.auto_detected ? `
          <div class="auto-detected">
            <small>自動記録（ケア通知から）</small>
          </div>
        ` : ''}
        ${record.image_url ? `
          <div class="care-image">
            <img src="${record.image_url}" alt="ケア記録" 
                 onclick="window.plantApp.showImageFullscreen('${record.image_url}', 'ケア記録 ${this.formatDate(record.care_date)}')"
                 loading="lazy">
          </div>
        ` : ''}
      </div>`;
  }

  showAddCareModal(threadId) {
    this.closeAllModals();
    
    const modalHtml = `
      <div id="add-care-modal" class="modal-overlay" onclick="event.stopPropagation()">
        <div class="modal-content" onclick="event.stopPropagation()">
          <div class="modal-header">
            <h3>ケア記録を追加</h3>
            <div class="season-context">
              <small>${this.seasonInfo.displayText}の季節を考慮したケア記録</small>
            </div>
            <button onclick="window.plantApp.closeAllModals()" class="close-btn">×</button>
          </div>
          <div class="modal-body">
            <form id="add-care-form">
              
              <div class="form-group">
                <label for="care-type-select">ケアの種類 *</label>
                <select id="care-type-select" required>
                  <option value="">選択してください</option>
                  ${Object.entries(this.careTypes).map(([type, config]) => 
                    `<option value="${type}">${config.icon} ${config.name}</option>`
                  ).join('')}
                </select>
              </div>

              <div class="form-group">
                <label for="care-date-input">ケア日 *</label>
                <input type="date" id="care-date-input" value="${new Date().toISOString().split('T')[0]}" required>
                <div class="help-text">実際にケアを行った日付を選択してください</div>
              </div>

              <div class="form-group">
                <label for="care-notes-input">ケア内容・メモ</label>
                <textarea id="care-notes-input" rows="3" 
                          placeholder="例: 
- 水やり: コップ1杯分の水をあげました
- 肥料: 液体肥料を規定量で希釈して与えました
- 植え替え: 一回り大きな鉢に植え替えました
- 剪定: 黄色い葉を取り除きました"></textarea>
                <div class="help-text">具体的なケア内容を記録すると、後で振り返りやすくなります</div>
              </div>

              <div class="form-group">
                <label for="custom-next-date-input">次回予定日（任意）</label>
                <input type="date" id="custom-next-date-input">
                <div class="help-text">空欄の場合は季節対応の推奨間隔を自動設定します</div>
              </div>

              <div class="seasonal-tips">
                <h6>${this.seasonInfo.displayText}のケアのコツ</h6>
                <p>${this.getSeasonalCareMessage(this.seasonInfo.season)}</p>
              </div>

              <div class="form-actions">
                <button type="submit" class="btn btn-primary">記録を保存</button>
                <button type="button" onclick="window.plantApp.closeAllModals()" class="btn btn-secondary">キャンセル</button>
              </div>

              <div id="care-save-status" class="save-status"></div>

            </form>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    const form = document.getElementById('add-care-form');
    
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveCareRecord(threadId);
      });
    }

    const handleEscKey = (e) => {
      if (e.key === 'Escape') {
        this.closeAllModals();
        document.removeEventListener('keydown', handleEscKey);
      }
    };
    document.addEventListener('keydown', handleEscKey);
  }

  async saveCareRecord(threadId) {
    const careType = document.getElementById('care-type-select')?.value;
    const careDate = document.getElementById('care-date-input')?.value;
    const notes = document.getElementById('care-notes-input')?.value;
    const customNextDate = document.getElementById('custom-next-date-input')?.value;
    
    if (!careType || !careDate) {
      this.showTemporaryNotification('ケアの種類と日付は必須です', 'error');
      return;
    }

    try {
      const response = await fetch(`${this.apiBase}?action=save_care_record`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          user_email: this.userEmail,
          entitlement: this.entitlement || {},
          entitlement_snapshot: this.entitlementSnapshot,
          thread_id: threadId,
          care_type: careType,
          care_date: careDate,
          notes: notes || '',
          custom_next_date: customNextDate || null
        })
      });

      const result = await response.json();
      
      if (result.success) {
        this.showTemporaryNotification('ケア記録を保存しました', 'success');
        this.closeAllModals();
        
        await this.loadCareRecords(threadId);
      } else {
        throw new Error(result.error);
      }
      
    } catch (error) {
      console.error('ケア記録保存エラー:', error);
      this.showTemporaryNotification(`保存に失敗: ${error.message}`, 'error');
    }
  }

renderCareAlertsTab(threadId) {
  const membershipType = this.getMembershipType();
  const isOwner = this.currentOpenThread?.is_owner !== false;
  
  // ★★★ 自分の投稿で無料会員の場合のみ訴求表示 ★★★
  if (isOwner && membershipType !== 'paid_member') {
    return `<div class="care-alerts-content">
        <div class="care-alerts-upgrade-required">
          <div class="feature-locked">
            <div class="lock-icon">🔒</div>
            <h5>ケア通知機能</h5>
            <p>季節対応のケア通知は有料会員限定機能です</p>
          </div>
          
          <div class="feature-preview">
            <h6>有料版で利用できる機能</h6>
            <ul>
              <li>水やり・肥料のタイミング通知</li>
              <li>季節に応じたケア間隔自動調整</li>
              <li>植え替え・剪定の推奨時期案内</li>
              <li>害虫対策のアラート</li>
              <li>優先度別ケア管理</li>
              <li>季節別ケアのコツ配信</li>
              <li>ケア間隔のカスタマイズ</li>
            </ul>
          </div>
          
          <div class="seasonal-demo">
            <h6>季節対応の例</h6>
            <div class="season-examples">
              <div class="season-example">
                <strong>春（3-5月）:</strong> 成長期のため水やり頻度20%増加
              </div>
              <div class="season-example">
                <strong>夏（6-8月）:</strong> 高温のため水やり頻度40%増加
              </div>
              <div class="season-example">
                <strong>秋（9-11月）:</strong> 標準間隔での管理
              </div>
              <div class="season-example">
                <strong>冬（12-2月）:</strong> 休眠期のため水やり頻度50%減少
              </div>
            </div>
          </div>
          
          <div class="upgrade-action">
            <a href="/products/leafla-subscription" class="btn btn-primary">
              月額300円でアップグレード
            </a>
            <p class="upgrade-benefits">ケア通知 + AI画像生成 + 植物50個まで登録</p>
          </div>
        </div>
      </div>`;
  }

  // ★★★ それ以外の場合はケア通知データを表示 ★★★
  return `<div class="care-alerts-content">
      <div class="care-alerts-header">
        <h4>ケア通知</h4>
        <p>植物のケアタイミングをお知らせします</p>
        <div class="current-season">
          ${this.seasonInfo.displayText} - ケア間隔自動調整中
        </div>
        ${isOwner ? `
          <div class="care-settings-controls">
            <button onclick="window.plantApp.showCareSettingsModal('${threadId}')" 
                     class="btn btn-secondary btn-small">
              ⚙️ ケア間隔をカスタマイズ
            </button>
          </div>
        ` : ''}
      </div>

      <div id="care-alerts-container-${threadId}">
        <div class="loading">ケア通知を読み込み中...</div>
      </div>
    </div>`;
}
async loadCareAlerts(threadId) {
  const container = document.getElementById(`care-alerts-container-${threadId}`);
  if (!container) {
    console.error('care-alerts-container が見つかりません');
    return;
  }

  try {
    console.log('ケアアラート読み込み開始:', threadId);

    const response = await fetch(`${this.apiBase}?action=care_alerts`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        user_email: this.userEmail,
        entitlement: this.entitlement,
        entitlement_snapshot: this.entitlementSnapshot,
        thread_id: threadId
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    
    if (data.error) {
      throw new Error(data.error);
    }
console.log('📦 ケアアラートの生データ:', data);
console.log('ケアアラート取得成功:', data.alerts?.length || 0);
console.log('📦 ケアアラートの生データ:', data);
console.log('📦 最初のアラート（全体）:', JSON.stringify(data.alerts[0], null, 2));
console.log('ケアアラート取得成功:', data.alerts?.length || 0);
    this.renderCareAlertsList(data.alerts || [], data.summary, threadId);

  } catch (error) {
    console.error('ケアアラート読み込みエラー:', error);
    container.innerHTML = `
      <div class="error-message">
        <h5>ケア通知の読み込みに失敗</h5>
        <p>エラー: ${error.message}</p>
        <div class="error-actions">
          <button onclick="window.plantApp.loadCareAlerts('${threadId}')" class="btn btn-small">
            再読み込み
          </button>
          <a href="/pages/contact" class="btn btn-small btn-primary" target="_blank">
            サポートに連絡
          </a>
        </div>
      </div>
    `;
  }
}

  renderCareAlertsList(alerts, summary, threadId) {
    const container = document.getElementById(`care-alerts-container-${threadId}`);
    if (!container) return;

    if (!alerts.length) {
      container.innerHTML = `
        <div class="no-care-alerts">
          <div class="empty-icon">⭐</div>
          <h5>現在、緊急のケア通知はありません</h5>
          <p>植物の状態は良好です。定期的なケア記録を続けて、健康状態を保ちましょう。</p>
          
          <div class="seasonal-tips">
            <h6>${this.seasonInfo.displayText}のケアのコツ</h6>
            <p>${this.getSeasonalCareMessage(this.seasonInfo.season)}</p>
          </div>

${this.currentOpenThread?.is_owner !== false ? `
  <div class="add-care-prompt">
    <button onclick="window.plantApp.showAddCareModal('${threadId}')" class="btn btn-primary">
      ケア記録を追加
    </button>
  </div>
` : ''}
        </div>
      `;
      return;
    }

    const summaryData = summary || {};
    
    container.innerHTML = `
      <div class="alerts-summary">
        <h5>ケア状況サマリー</h5>
        <div class="summary-grid">
          <div class="summary-item priority-high">
            <span class="priority-count">${summaryData.high_priority || 0}</span>
            <span class="priority-label">緊急</span>
          </div>
          <div class="summary-item priority-medium">
            <span class="priority-count">${summaryData.medium_priority || 0}</span>
            <span class="priority-label">注意</span>
          </div>
          <div class="summary-item priority-low">
            <span class="priority-count">${summaryData.low_priority || 0}</span>
            <span class="priority-label">推奨</span>
          </div>
        </div>
        <div class="season-adjustment-info">
          <p><small>${this.seasonInfo.displayText}の季節係数を適用中</small></p>
        </div>
      </div>

      <div class="care-alerts-list">
        <h5>ケア通知一覧</h5>
        ${alerts.map(alert => this.renderCareAlertItem(alert, threadId)).join('')}
      </div>
      
<div class="care-alerts-footer">
  <p>定期的なケア記録で、植物の健康状態を最適に保ちましょう</p>
  ${this.currentOpenThread?.is_owner !== false ? `
    <div class="footer-actions">
      <button onclick="window.plantApp.showAddCareModal('${threadId}')" class="btn btn-primary">
        ケア記録を追加
      </button>
      <button onclick="window.plantApp.loadCareAlerts('${threadId}')" class="btn btn-secondary">
        通知を更新
      </button>
    </div>
  ` : ''}
</div>
    `;
  }

  renderCareAlertItem(alert, threadId) {
    const careInfo = this.careTypes[alert.care_type] || this.careTypes.other;
    
    return `<div class="alert-item priority-${alert.priority}">
        <div class="alert-header">
          <div class="alert-care-info">
            <span class="care-icon">${careInfo.icon}</span>
            <span class="care-name">${careInfo.name}</span>
            <span class="priority-badge ${alert.priority}">${this.getPriorityLabel(alert.priority)}</span>
          </div>
<div class="alert-actions">
  ${this.currentOpenThread?.is_owner !== false ? `
    <button onclick="window.plantApp.markCareAsDone('${threadId}', '${alert.care_type}')" 
            class="btn btn-small btn-success">
      ✓ 完了
    </button>
  ` : ''}
</div>
        </div>
        
        <div class="alert-details">
          <div class="alert-message">
            <p><strong>${alert.recommended_action || 'ケアが推奨されます'}</strong></p>
            <p class="alert-description">${alert.alert_message || 'タイミングです'}</p>
          </div>
          
          ${alert.seasonal_message ? `
            <div class="seasonal-message">
              <p>${alert.seasonal_message}</p>
            </div>
          ` : ''}
          
          <div class="alert-timing">
            ${alert.last_care_date ? `
              <span class="last-care">前回: ${this.formatDate(alert.last_care_date)}</span>
            ` : ''}
            <span class="days-since">${alert.days_since || 0}日経過</span>
            <span class="recommended-interval">推奨: ${alert.recommended_interval || 7}日毎</span>
          </div>
        </div>
      </div>`;
  }

  getPriorityLabel(priority) {
    const labels = {
      'high': '緊急',
      'medium': '注意',
      'low': '推奨'
    };
    return labels[priority] || '通常';
  }

  async markCareAsDone(threadId, careType) {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      const response = await fetch(`${this.apiBase}?action=save_care_record`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          user_email: this.userEmail,
          entitlement: this.entitlement,
          entitlement_snapshot: this.entitlementSnapshot,
          thread_id: threadId,
          care_type: careType,
          care_date: today,
          notes: 'ケア通知から完了マーク',
          auto_detected: true
        })
      });

      const result = await response.json();
      
      if (result.success) {
        const careInfo = this.careTypes[careType] || this.careTypes.other;
        this.showTemporaryNotification(`${careInfo.name}のケア記録を保存しました`, 'success');
        
        await Promise.all([
          this.loadCareAlerts(threadId),
          this.loadCareRecords(threadId)
        ]);
        
      } else {
        throw new Error(result.error);
      }

    } catch (error) {
      console.error('ケア完了マークエラー:', error);
      this.showTemporaryNotification(`ケア記録の保存に失敗: ${error.message}`, 'error');
    }
  }

  renderGrowthComparisonTab(threadId) {
    return `<div class="growth-comparison-content">
        <div class="growth-comparison-header">
          <h4>成長比較</h4>
          <p>この植物の成長記録を時系列で比較・分析できます</p>
        </div>

        <div id="growth-images-container-${threadId}">
          <div class="loading">成長画像データを読み込み中...</div>
        </div>
      </div>`;
  }

  async loadGrowthImages(threadId) {
    const container = document.getElementById(`growth-images-container-${threadId}`);
    if (!container) {
      console.error('growth-images-container が見つかりません');
      return;
    }

    try {
      console.log('成長画像データ読み込み開始:', threadId);

      const response = await fetch(`${this.apiBase}?action=growth_images`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          user_email: this.userEmail,
          entitlement: this.entitlement,
          entitlement_snapshot: this.entitlementSnapshot,
          thread_id: threadId
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error);
      }

      console.log('成長画像取得成功:', data.images?.length || 0);
      this.renderGrowthImagesList(data.images || [], data.comparison_data, threadId);

    } catch (error) {
      console.error('成長画像読み込みエラー:', error);
      container.innerHTML = `
        <div class="error-message">
          <h5>成長画像の読み込みに失敗</h5>
          <p>エラー: ${error.message}</p>
          <div class="error-actions">
            <button onclick="window.plantApp.loadGrowthImages('${threadId}')" class="btn btn-small">
              再読み込み
            </button>
          </div>
        </div>
      `;
    }
  }

  renderGrowthImagesList(images, comparisonData, threadId) {
    const container = document.getElementById(`growth-images-container-${threadId}`);
    if (!container) return;

    if (!images.length) {
      container.innerHTML = `
        <div class="no-growth-images">
          <div class="empty-icon">📸</div>
          <h5>まだ成長記録画像がありません</h5>
          <p>育成記録投稿時に写真を添付すると、ここで成長比較ができるようになります</p>
          
          <div class="growth-benefits">
            <h6>成長比較のメリット</h6>
            <ul>
              <li>植物の成長速度を可視化</li>
              <li>ケアの効果を確認</li>
              <li>問題の早期発見</li>
              <li>最適な管理方法の発見</li>
            </ul>
          </div>
        </div>
      `;
      return;
    }

    const statistics = comparisonData || {};
    
    container.innerHTML = `
      <div class="growth-statistics">
        <h5>成長記録統計</h5>
        <div class="stats-grid">
          <div class="stat-item">
            <span class="stat-label">記録期間</span>
            <span class="stat-value">${statistics.total_days || 0}日</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">写真記録</span>
            <span class="stat-value">${statistics.image_count || 0}回</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">平均間隔</span>
            <span class="stat-value">${statistics.average_interval || 0}日</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">記録数</span>
            <span class="stat-value">${this.calculateGrowthRate(statistics)}%</span>
          </div>
        </div>
        <div class="seasonal-growth-note">
          <p><small>現在の季節（${this.seasonInfo.displayText}）での成長記録</small></p>
        </div>
      </div>
      
      <div class="growth-timeline">
        <h5>成長タイムライン</h5>
        <div class="timeline-images" id="growth-timeline-${threadId}">
          ${this.renderGrowthTimelineImages(images, statistics)}
        </div>
      </div>
      
      ${images.some(img => img.ai_generated_image_url) ? `
        <div class="generated-images-section">
          <h5>AI生成ケアイラスト履歴</h5>
          <div class="generated-images-grid">
            ${images.filter(img => img.ai_generated_image_url).map(image => `
              <div class="generated-image-item">
                <img src="${image.ai_generated_image_url}" 
                     alt="ケアイラスト ${this.formatDate(image.created_at)}"
                     onclick="window.plantApp.showImageFullscreen('${image.ai_generated_image_url}', 'ケアイラスト ${this.formatDate(image.created_at)}')"
                     loading="lazy">
                <div class="generated-date">${this.formatDate(image.created_at)}</div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
      
      <div class="growth-insights">
        <h6>成長パターン分析</h6>
        ${this.renderGrowthInsights(statistics)}
      </div>
      
      <div class="growth-tips">
        <h6>成長比較のコツ</h6>
        <ul>
          <li>定期的に同じ角度・距離から撮影</li>
          <li>自然光での撮影で色味を正確に</li>
          <li>新芽や葉の変化に注目</li>
          <li>ケア記録と合わせて分析</li>
          <li>季節による成長速度の違いを考慮</li>
        </ul>
      </div>
    `;
  }

  renderGrowthTimelineImages(images, statistics) {
    return images.map((image, index) => {
      const milestone = statistics.growth_milestones?.[index] || {};
      const daysSince = milestone.days_since_previous || 0;
      
      return `<div class="growth-snapshot">
          <div class="snapshot-image">
            <img src="${image.input_image_url}" 
                 alt="成長記録 ${this.formatDate(image.created_at)}"
                 onclick="window.plantApp.showImageFullscreen('${image.input_image_url}', '成長記録 ${this.formatDate(image.created_at)}')"
                 loading="lazy">
            <div class="snapshot-overlay">
              <span class="snapshot-date">${this.formatDate(image.created_at)}</span>
              <span class="snapshot-index">#${index + 1}</span>
            </div>
          </div>
          
          <div class="snapshot-info">
            <div class="milestone-label">
              ${milestone.milestone_label || (index === 0 ? '記録開始' : `記録 ${index + 1}`)}
            </div>
            
            ${daysSince > 0 ? `
              <div class="interval-info">
                <span class="interval">${daysSince}日後</span>
                <span class="growth-rate">${this.getGrowthRateLabel(daysSince)}</span>
              </div>
            ` : ''}
            
            ${image.description ? `
              <div class="snapshot-description">
                <p>${this.escapeHtml(image.description.substring(0, 80))}${image.description.length > 80 ? '...' : ''}</p>
              </div>
            ` : ''}

            <div class="snapshot-actions">
              <button onclick="window.plantApp.showImageComparison(${index}, '${image.input_image_url}')" 
                      class="btn btn-small btn-secondary">
                比較
              </button>
            </div>
          </div>
        </div>`;
    }).join('');
  }

  calculateGrowthRate(statistics) {
    if (!statistics.total_days || !statistics.image_count) return 0;
    return Math.round((statistics.image_count / statistics.total_days) * 30 * 100) / 100;
  }

  getGrowthRateLabel(days) {
    if (days <= 7) return '高頻度';
    if (days <= 14) return '標準';
    if (days <= 30) return '低頻度';
    return '長期間隔';
  }

  renderGrowthInsights(statistics) {
    const insights = [];
    
    if (statistics.total_days > 90) {
      insights.push(`長期間（${Math.floor(statistics.total_days / 30)}ヶ月）にわたって継続的に記録されています`);
    }

    if (statistics.average_interval <= 7) {
      insights.push('頻繁な記録により、詳細な成長過程を追跡できています');
    }

    insights.push(`${this.seasonInfo.seasonName}の季節特性を考慮した成長パターンです`);

    if (statistics.image_count >= 10) {
      insights.push('豊富な画像データにより、成長の変化を明確に確認できます');
    }

    return insights.length > 0 ? `
      <div class="insights-list">
        ${insights.map(insight => `<p>• ${insight}</p>`).join('')}
      </div>
    ` : '<p>さらに記録を続けることで、より詳細な分析が可能になります。</p>';
  }

  showImageComparison(currentIndex, imageUrl) {
    this.showImageFullscreen(imageUrl, `成長記録 #${currentIndex + 1}`);
  }

  async showCareSettingsModal(threadId) {
    const membershipType = this.getMembershipType();
    
    if (membershipType !== 'paid_member') {
      this.showTemporaryNotification('ケア設定は有料会員限定機能です', 'error');
      return;
    }

    this.closeAllModals();

    try {
      const currentSettings = await this.loadCareSettings(threadId);
      
      const modalHtml = `
        <div id="care-settings-modal" class="modal-overlay" onclick="event.stopPropagation()">
          <div class="modal-content care-settings-content" onclick="event.stopPropagation()">
            <div class="modal-header">
              <h3>ケア間隔カスタマイズ</h3>
              <div class="season-context">
                <small>${this.seasonInfo.displayText}の設定 - 個別にケア間隔を調整できます</small>
              </div>
              <button onclick="window.plantApp.closeAllModals()" class="close-btn">×</button>
            </div>
            
            <div class="modal-body">
              <div class="care-settings-form-container">
                
                <div class="settings-info">
                  <h5>カスタム間隔設定</h5>
                  <p>各ケアの推奨間隔を個別に設定できます。季節による自動調整も適用されます。</p>
                </div>

                <form id="care-settings-form">
                  ${this.renderCareSettingsForm(currentSettings)}
                </form>

                <div class="settings-actions">
                  <button onclick="window.plantApp.saveCareSettings('${threadId}')" 
                          class="btn btn-primary" id="save-care-settings-btn">
                    設定を保存
                  </button>
                  <button onclick="window.plantApp.resetCareSettings('${threadId}')" 
                          class="btn btn-secondary">
                    デフォルトに戻す
                  </button>
                  <button onclick="window.plantApp.closeAllModals()" 
                          class="btn btn-secondary">
                    キャンセル
                  </button>
                </div>

                <div id="care-settings-status" class="settings-status"></div>

              </div>
            </div>
          </div>
        </div>
      `;

      document.body.insertAdjacentHTML('beforeend', modalHtml);

    } catch (error) {
      console.error('ケア設定モーダル表示エラー:', error);
      this.showTemporaryNotification('ケア設定の読み込みに失敗しました', 'error');
    }
  }

  renderCareSettingsForm(currentSettings) {
    const careTypes = Object.entries(this.careTypes);
    
    return `<div class="care-settings-grid">
        ${careTypes.map(([careType, config]) => {
          const setting = currentSettings.find(s => s.care_type === careType) || {};
          const defaultInterval = config.base_interval_days;
          const seasonalMultiplier = config.seasonal_multipliers[this.seasonInfo.season] || 1.0;
          const seasonalInterval = Math.round(defaultInterval * seasonalMultiplier);
          const customInterval = setting.custom_interval_days || '';
          
          return `<div class="care-setting-item" data-care-type="${careType}">
              <div class="care-setting-header">
                <span class="care-icon">${config.icon}</span>
                <h6>${config.name}</h6>
              </div>
              
              <div class="interval-settings">
                <div class="interval-info">
                  <span class="default-interval">標準: ${defaultInterval}日</span>
                  <span class="seasonal-interval">現在(${this.seasonInfo.seasonName}): ${seasonalInterval}日</span>
                </div>
                
                <div class="custom-interval-input">
                  <label for="custom-${careType}">カスタム間隔（日）:</label>
                  <input type="number" 
                         id="custom-${careType}" 
                         name="custom_${careType}"
                         value="${customInterval}" 
                         placeholder="${seasonalInterval}"
                         min="1" 
                         max="365">
                  <small>空白で季節自動調整</small>
                </div>
                
                <div class="advance-settings">
                  <label for="advance-${careType}">事前通知（日）:</label>
                  <select id="advance-${careType}" name="advance_${careType}">
                    <option value="1" ${(setting.alert_advance_days || 1) === 1 ? 'selected' : ''}>1日前</option>
                    <option value="2" ${setting.alert_advance_days === 2 ? 'selected' : ''}>2日前</option>
                    <option value="3" ${setting.alert_advance_days === 3 ? 'selected' : ''}>3日前</option>
                    <option value="7" ${setting.alert_advance_days === 7 ? 'selected' : ''}>1週間前</option>
                  </select>
                </div>
                
                <div class="enable-setting">
                  <label>
                    <input type="checkbox" 
                           id="enabled-${careType}" 
                           name="enabled_${careType}"
                           ${setting.is_enabled !== false ? 'checked' : ''}>
                    この通知を有効にする
                  </label>
                </div>
              </div>
            </div>`;
        }).join('')}
      </div>

      <div class="seasonal-explanation">
        <h6>${this.seasonInfo.seasonName}の季節係数</h6>
        <div class="multipliers-info">
          ${careTypes.map(([careType, config]) => {
            const multiplier = config.seasonal_multipliers[this.seasonInfo.season];
            const effect = multiplier < 1 ? '短縮' : multiplier > 1 ? '延長' : '標準';
            return `<span class="multiplier-item">
                ${config.icon} ${config.name}: ${multiplier}倍 (${effect})
              </span>`;
          }).join('')}
        </div>
      </div>`;
  }

  async loadCareSettings(threadId) {
    try {
      const response = await fetch(`${this.apiBase}?action=get_care_settings`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          user_email: this.userEmail,
          entitlement: this.entitlement,
          entitlement_snapshot: this.entitlementSnapshot,
          thread_id: threadId
        })
      });

      const data = await response.json();
      
      if (data.success) {
        return data.settings || [];
      } else {
        throw new Error(data.error || 'ケア設定の取得に失敗');
      }

    } catch (error) {
      console.error('ケア設定読み込みエラー:', error);
      return [];
    }
  }

async saveCareSettings(threadId) {
  const statusDiv = document.getElementById('care-settings-status');
  const saveBtn = document.getElementById('save-care-settings-btn');
  
  if (!statusDiv || !saveBtn) {
    console.error('ケア設定UI要素が見つかりません');
    return;
  }

  saveBtn.disabled = true;
  const originalText = saveBtn.textContent;
  saveBtn.textContent = '保存中...';

  statusDiv.innerHTML = `
    <div class="loading-message">
      <div class="spinner"></div>
      <p>ケア設定を保存中...</p>
    </div>
  `;

  try {
    const form = document.getElementById('care-settings-form');
    if (!form) {
      throw new Error('ケア設定フォームが見つかりません');
    }
    
    const formData = new FormData(form);
    const careTypes = Object.keys(this.careTypes);
    
    // デバッグ：フォームデータの内容をログ出力
    console.log('フォームから取得するケアタイプ:', careTypes);
    console.log('フォームデータのキー一覧:', Array.from(formData.keys()));
    
    const savePromises = [];
    
    for (const careType of careTypes) {
      const customInterval = formData.get(`custom_${careType}`);
      const advanceDays = formData.get(`advance_${careType}`);
      const isEnabled = formData.has(`enabled_${careType}`);
      
      // デバッグ：各ケアタイプの設定値をログ出力
      console.log(`${careType}の設定:`, {
        customInterval,
        advanceDays,
        isEnabled
      });
      
      const settingData = {
        user_email: this.userEmail,
        entitlement: this.entitlement,
        thread_id: threadId,
        care_type: careType,
        custom_interval_days: customInterval ? parseInt(customInterval) : null,
        alert_advance_days: parseInt(advanceDays) || 1,
        is_enabled: isEnabled
      };
      
      // デバッグ：送信するデータをログ出力
      console.log(`${careType}用送信データ:`, settingData);
      
      const savePromise = fetch(`${this.apiBase}?action=save_care_settings`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(settingData)
      })
      .then(async response => {
        console.log(`${careType}のレスポンス:`, response.status, response.statusText);
        const result = await response.json();
        console.log(`${careType}の結果:`, result);
        return result;
      })
      .catch(error => {
        console.error(`${careType}のAPI呼び出しエラー:`, error);
        return { success: false, error: error.message };
      });
      
      savePromises.push(savePromise);
    }

    console.log('API呼び出し開始:', savePromises.length + '件');
    
    const results = await Promise.all(savePromises);
    
    // デバッグ：全結果をログ出力
    console.log('全API結果:', results);
    
    const failures = results.filter(r => !r.success);
    
    if (failures.length > 0) {
      console.error('保存失敗詳細:', failures);
      throw new Error(`${failures.length}件の設定保存に失敗しました`);
    }

      statusDiv.innerHTML = `
        <div class="success-message">
          <h5>✅ 設定保存完了</h5>
          <p>すべてのケア設定を保存しました</p>
          <p><small>新しい設定はケア通知に即座に反映されます</small></p>
        </div>
      `;

      this.showTemporaryNotification('ケア設定を保存しました', 'success');
      
      if (this.currentOpenThread) {
        setTimeout(() => {
          this.loadCareAlerts(this.currentOpenThread.id);
        }, 1000);
      }

    } catch (error) {
      console.error('ケア設定保存エラー:', error);
      
      statusDiv.innerHTML = `
        <div class="error-message">
          <h5>❌ 保存失敗</h5>
          <p>エラー: ${error.message}</p>
          <div class="error-actions">
            <button onclick="window.plantApp.saveCareSettings('${threadId}')" class="btn btn-small">
              再試行
            </button>
          </div>
        </div>
      `;
      
      this.showTemporaryNotification('ケア設定の保存に失敗しました', 'error');
      
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = originalText;
    }
  }

  async resetCareSettings(threadId) {
    if (!confirm('すべてのケア設定をデフォルト（季節自動調整）に戻しますか？')) {
      return;
    }

    const careTypes = Object.keys(this.careTypes);
    const promises = [];

    for (const careType of careTypes) {
      const defaultData = {
        user_email: this.userEmail,
        entitlement: this.entitlement,
        thread_id: threadId,
        care_type: careType,
        custom_interval_days: null,
        alert_advance_days: 1,
        is_enabled: true
      };
      
      promises.push(
        fetch(`${this.apiBase}?action=save_care_settings`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify(defaultData)
        })
      );
    }

    try {
      await Promise.all(promises);
      this.showTemporaryNotification('設定をデフォルトに戻しました', 'success');
      this.closeAllModals();
      
      setTimeout(() => {
        this.showCareSettingsModal(threadId);
      }, 500);

    } catch (error) {
      this.showTemporaryNotification('リセットに失敗しました', 'error');
    }
  }

  confirmDeletePost(postId, threadId = null) {
    console.log('削除確認開始:', { postId, threadId });
    this.closeAllModals();

    const modalHtml = `
      <div id="delete-confirm-modal" class="modal-overlay" onclick="event.stopPropagation()">
        <div class="modal-content" onclick="event.stopPropagation()">
          <div class="modal-header">
            <h3>投稿削除の確認</h3>
            <button onclick="window.plantApp.closeAllModals()" class="close-btn">×</button>
          </div>
          <div class="modal-body">
            <div class="delete-warning">
              <h4>⚠️ この操作は取り消せません</h4>
              <p><strong>この育成記録を完全に削除しますか？</strong></p>
              <ul>
                <li>投稿内容とAI回答が削除されます</li>
                <li>添付画像も完全に削除されます</li>
                <li>追加相談履歴もすべて削除されます</li>
                <li>この投稿が植物の最後の記録の場合、植物記録全体も削除されます</li>
              </ul>
              <div class="deletion-impact">
                <p><strong>削除の影響範囲:</strong></p>
                <p>• データベースから完全に削除（復元不可）</p>
                <p>• 関連するケア記録への影響はありません</p>
                <p>• 他の植物記録への影響はありません</p>
              </div>
            </div>

            <div class="form-actions">
              <button onclick="window.plantApp.executeDeletePost('${postId}', '${threadId || ''}')" 
                      class="btn btn-danger" id="delete-execute-btn">
                🗑️ 完全に削除する
              </button>
              <button onclick="window.plantApp.closeAllModals()" 
                      class="btn btn-secondary">
                キャンセル
              </button>
            </div>

            <div id="delete-status" class="delete-status"></div>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    const handleEscKey = (e) => {
      if (e.key === 'Escape') {
        this.closeAllModals();
        document.removeEventListener('keydown', handleEscKey);
      }
    };
    document.addEventListener('keydown', handleEscKey);
  }
async togglePostVisibility(postId, currentIsPublic) {
  const membershipType = this.getMembershipType();
  if (membershipType === 'non_member') {
    this.showTemporaryNotification('SNS機能は会員限定です', 'error');
    return;
  }
  
  const newStatus = !currentIsPublic;
  const actionText = newStatus ? '公開' : '非公開';
  
  if (!confirm(`この投稿を「${actionText}」に変更しますか？\n\n${
    newStatus 
      ? '公開すると、他のユーザーがあなたの記録を見ていいね・コメントできます。' 
      : '非公開にすると、他のユーザーから見えなくなります（既存のいいね・コメントは保持されます）。'
  }`)) {
    return;
  }
  
  try {
    console.log('公開設定変更:', { postId, currentIsPublic, newStatus });
    
    const response = await fetch(`${this.apiBase}?action=toggle_post_visibility`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        user_email: this.userEmail,
        post_id: postId,
        is_public: newStatus
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (data.success) {
      this.showTemporaryNotification(
        `投稿を「${actionText}」に変更しました`, 
        'success'
      );
      
      // モーダル内容を更新
      if (this.currentOpenThread?.id) {
        const posts = await this.loadThreadPosts(this.currentOpenThread.id);
        const timelineContent = document.querySelector('[data-tab="timeline"].tab-content');
        if (timelineContent) {
          timelineContent.innerHTML = this.renderAdvancedTimelineTab(posts);
        }
      }
    } else {
      throw new Error(data.error || '公開設定の変更に失敗しました');
    }
    
  } catch (error) {
    console.error('公開設定変更エラー:', error);
    this.showTemporaryNotification(
      `公開設定の変更に失敗: ${error.message}`, 
      'error'
    );
  }
}

previewPublicPost() {
  const form = document.getElementById('consultation-form');
  if (!form) return;
  
  const plantName = document.getElementById('plant-name')?.value || '（未入力）';
  const notes = document.getElementById('notes')?.value || '（なし）';
  const consultation = document.getElementById('consultation')?.value || '（なし）';
  
  const message = `
📢 公開プレビュー

━━━━━━━━━━━━━━━━━━━
植物名: ${plantName}
━━━━━━━━━━━━━━━━━━━

記録: ${notes.substring(0, 50)}${notes.length > 50 ? '...' : ''}

相談内容: ${consultation.substring(0, 50)}${consultation.length > 50 ? '...' : ''}

━━━━━━━━━━━━━━━━━━━
⚠️ 確認事項
━━━━━━━━━━━━━━━━━━━
・個人情報が含まれていないか
・公開したくない情報が写っていないか
・他人の権利を侵害していないか

※ 詳細なプレビューは後日実装予定
  `.trim();
  
  alert(message);
}
// ==========================================
// SNS機能関連メソッド（Phase 3 Part 2）
// ==========================================

initSNSState() {
  this.snsState = {
    currentSort: 'recent',
    currentPage: 1,
    hasMore: true,
    posts: []
  };
}

openSNSFeed() {
  const existingModal = document.getElementById('sns-feed-modal');
  if (existingModal) {
    existingModal.remove();
  }
  const membershipType = this.getMembershipType();
  if (membershipType === 'non_member') {
    this.showTemporaryNotification('SNS機能は会員限定です', 'error');
    return;
  }
  
  // 既存のモーダルを閉じる
  this.closeAllModals();
  
  // SNS状態を初期化
  if (!this.snsState) {
    this.initSNSState();
  }
  
  // SNSフィードページを表示
  const modalHtml = `
    <div id="sns-feed-modal" class="modal-overlay" onclick="event.stopPropagation()">
      <div class="modal-content sns-feed-modal-content" onclick="event.stopPropagation()">
        ${this.renderSNSFeedPage()}
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', modalHtml);
  
  // 投稿を読み込み
  this.loadPublicPosts('recent', 1, false);
}

closeSNSFeed() {
  const modal = document.getElementById('sns-feed-modal');
  if (modal) {
    modal.remove();
  }
}

renderSNSFeedPage() {
  const membershipType = this.getMembershipType();
  
  if (membershipType === 'non_member') {
    return `
      <div class="empty-content">
        <div class="empty-icon">🔒</div>
        <h3>SNS機能は会員限定です</h3>
        <p>会員登録すると、他のユーザーの育成記録を見たり、いいね・コメントができます。</p>
      </div>
    `;
  }
  
  return `
    <div class="sns-feed-container">
      <!-- ヘッダー -->
      <div class="sns-feed-header">
        <h2>DISCOVER</h2>
        <button onclick="window.plantApp.closeSNSFeed()" class="close-btn" type="button">×</button>
      </div>
      
      <!-- ソート切り替え -->
      <div class="sns-sort-tabs">
        <button class="sort-tab active" data-sort="recent" onclick="window.plantApp.changeSNSSort('recent')">
          FEED
        </button>
        <button class="sort-tab" data-sort="popular" onclick="window.plantApp.changeSNSSort('popular')">
          PICKUP
        </button>
        <button class="sort-tab" data-sort="trending" onclick="window.plantApp.changeSNSSort('trending')">
          TREND
        </button>
      </div>
      
      <!-- 投稿一覧 -->
      <div id="sns-posts-container" class="sns-posts-container">
        <div class="loading-indicator">
          <div class="spinner"></div>
          <p>投稿を読み込み中...</p>
        </div>
      </div>
      
      <!-- もっと見るボタン -->
      <div id="load-more-container" class="load-more-container" style="display: none;">
        <button onclick="window.plantApp.loadMoreSNSPosts()" class="btn btn-secondary">
          もっと見る
        </button>
      </div>
    </div>
  `;
}

async loadPublicPosts(sortBy = 'recent', page = 1, append = false) {
  try {
    console.log('📢 公開投稿取得:', { sortBy, page });
    
    const response = await fetch(`${this.apiBase}?action=public_posts`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        user_email: this.userEmail,
        sort_by: sortBy,
        page: page,
        limit: 20
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (data.success) {
      if (append) {
        this.snsState.posts = [...this.snsState.posts, ...data.posts];
      } else {
        this.snsState.posts = data.posts;
      }
      
      this.snsState.hasMore = data.has_more;
      this.snsState.currentPage = page;
      
      this.renderSNSPosts();
      
      console.log('✅ 投稿取得成功:', {
        count: data.posts.length,
        hasMore: data.has_more
      });
      
    } else {
      throw new Error(data.error || '投稿の取得に失敗しました');
    }
    
  } catch (error) {
    console.error('投稿取得エラー:', error);
    this.showTemporaryNotification(
      `投稿の取得に失敗: ${error.message}`,
      'error'
    );
    
    // エラー表示
    const container = document.getElementById('sns-posts-container');
    if (container) {
      container.innerHTML = `
        <div class="empty-content">
          <div class="empty-icon">⚠️</div>
          <h3>投稿の取得に失敗しました</h3>
          <p>${this.escapeHtml(error.message)}</p>
          <button onclick="window.plantApp.loadPublicPosts('${sortBy}', 1)" class="btn btn-primary">
            再読み込み
          </button>
        </div>
      `;
    }
  }
}

renderSNSPosts() {
  const container = document.getElementById('sns-posts-container');
  if (!container) return;
  
  const posts = this.snsState.posts;
  
  if (posts.length === 0) {
    container.innerHTML = `
      <div class="empty-content">
        <div class="empty-icon">📭</div>
        <h3>まだ投稿がありません</h3>
        <p>最初の投稿をしてみませんか？</p>
        <button onclick="window.plantApp.closeSNSFeed()" class="btn btn-primary">
          新しい相談を投稿
        </button>
      </div>
    `;
    return;
  }
  
  // ★ 最新タブの場合はグリッド表示
  if (this.snsState.currentSort === 'recent') {
    container.innerHTML = `
      <div class="sns-grid-container">
        ${posts.map(post => `
          <div class="sns-grid-item" onclick="window.plantApp.openPostDetail('${post.id}')">
            ${post.input_image_url ? `
              <img src="${post.input_image_url}" alt="${this.escapeHtml(post.plant_name)}" loading="lazy">
            ` : `
              <div class="no-image-placeholder">
                <span>🌱</span>
                <span>${this.escapeHtml(post.plant_name)}</span>
              </div>
            `}
          </div>
        `).join('')}
      </div>
    `;
  } else {
    // ★ 人気・トレンドタブは既存のカード表示
    container.innerHTML = posts.map(post => this.renderSNSPostCard(post)).join('');
  }
  
  // もっと見るボタンの表示制御
  const loadMoreContainer = document.getElementById('load-more-container');
  if (loadMoreContainer) {
    loadMoreContainer.style.display = this.snsState.hasMore ? 'block' : 'none';
  }
}

renderSNSPostCard(post) {
  console.log('📦 renderSNSPostCard 受信データ:', {
    post_id: post.id,
    user_email: post.user_email,
    user_profiles: post.user_profiles,
    user_nickname: post.user_nickname,
    全体: post
  });
  const timeAgo = this.getTimeAgo(post.created_at);
  const formattedDate = this.formatDateTime(post.created_at);
  const isOwnPost = post.user_email === this.userEmail;
  
  // ★ user_profilesの取得（複数パターン対応）
  const userProfile = post.user_profiles || post.user_profile || null;
  
  // ★ 表示名の決定（優先順位: nickname > username > email）
  const displayName = userProfile?.nickname || 
                     userProfile?.username || 
                     post.user_nickname ||
                     'botaple'; 
  
  // ★ プロフィールURLの生成
  const username = userProfile?.username;
  const profileUrl = username 
    ? `/pages/community?user=${encodeURIComponent(username)}`
    : null;
  
  // ★ プロフィール画像URL
  const profileImageUrl = userProfile?.profile_image_url || null;
  
  console.log('🎨 SNS投稿カード生成:', {
    post_id: post.id,
    displayName,
    profileUrl,
    profileImageUrl,
    userProfile
  });
  
  return `
    <div class="sns-post-card" data-post-id="${post.id}">
      <div class="post-header">
        <div class="post-author-info">
          <div class="author-avatar">
            ${profileImageUrl ? `
              <img src="${profileImageUrl}" alt="${this.escapeHtml(displayName)}" 
                   style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover;">
            ` : `
              <div style="width: 40px; height: 40px; border-radius: 50%; background: #dbeafe; 
                          display: flex; align-items: center; justify-content: center; font-size: 20px;">
                🌱
              </div>
            `}
          </div>
          <div class="author-details">
            <div class="author-name">
              ${profileUrl ? `
                <a href="${profileUrl}" 
                   style="color: #333; text-decoration: none; font-weight: 600;"
                   onclick="event.stopPropagation();">
                  ${this.escapeHtml(displayName)}
                </a>
              ` : `
                <span style="color: #999; font-weight: 600;">
                  ${this.escapeHtml(displayName)}
                </span>
              `}
            </div>
            <div class="post-date" style="font-size: 12px; color: #6b7280;">
              ${timeAgo}
            </div>
          </div>
        </div>
      </div>
      
      <div class="post-content" onclick="window.plantApp.openPostDetail('${post.id}')">
        <h3 class="post-title">${this.escapeHtml(post.plant_name)}</h3>
        
        ${post.input_image_url ? `
          <div class="post-image">
            <img src="${post.input_image_url}" alt="${this.escapeHtml(post.plant_name)}" loading="lazy">
          </div>
        ` : ''}
        
        ${post.notes ? `
          <div class="post-notes">
            <p>${this.escapeHtml(post.notes).substring(0, 150)}${post.notes.length > 150 ? '...' : ''}</p>
          </div>
        ` : ''}
        
        ${post.consultation_request ? `
          <div class="post-consultation">
            <p>${this.escapeHtml(post.consultation_request).substring(0, 150)}${post.consultation_request.length > 150 ? '...' : ''}</p>
          </div>
        ` : ''}
      </div>
      
<div class="post-actions">
  <button class="action-btn ${post.user_has_liked ? 'liked' : ''}" 
          onclick="event.stopPropagation(); window.plantApp.toggleLike('${post.id}')">
    ${post.user_has_liked ? '❤️' : '🤍'} ${post.like_count || 0}
  </button>
  
  <button class="action-btn" onclick="event.stopPropagation(); window.plantApp.openPostDetail('${post.id}')">
    💬 ${post.comment_count || 0}
  </button>
  
  ${isOwnPost ? `
    <button class="action-btn" disabled>
      👁️ ${post.view_count || 0}
    </button>
  ` : ''}
</div>
    </div>
  `;
}

getTimeAgo(dateString) {
  const now = new Date();
  const past = new Date(dateString);
  const diffMs = now - past;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffMins < 1) return 'たった今';
  if (diffMins < 60) return `${diffMins}分前`;
  if (diffHours < 24) return `${diffHours}時間前`;
  if (diffDays < 7) return `${diffDays}日前`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}週間前`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}ヶ月前`;
  return `${Math.floor(diffDays / 365)}年前`;
}

changeSNSSort(sortBy) {
  this.snsState.currentSort = sortBy;
  this.snsState.currentPage = 1;
  
  // タブのアクティブ状態を更新
  document.querySelectorAll('.sort-tab').forEach(tab => {
    tab.classList.remove('active');
    if (tab.dataset.sort === sortBy) {
      tab.classList.add('active');
    }
  });
  
  // 投稿を再読み込み
  this.loadPublicPosts(sortBy, 1, false);
}

async loadMoreSNSPosts() {
  const nextPage = this.snsState.currentPage + 1;
  await this.loadPublicPosts(this.snsState.currentSort, nextPage, true);
}

async openPostDetail(postId) {
  const membershipType = this.getMembershipType();
  if (membershipType === 'non_member') {
    this.showTemporaryNotification('投稿詳細は会員限定です', 'error');
    return;
  }
  
  try {
    console.log('📖 投稿詳細表示開始:', postId);
    
    // ★★★ まず snsState.posts から投稿を探す ★★★
    let post = this.snsState.posts.find(p => p.id === postId);
    
    if (post) {
      console.log('✅ キャッシュから投稿取得:', post);
      // 閲覧数をカウント
      this.incrementViewCount(postId);
      this.renderPostDetailModal(post);
      return;
    }
    
    // ★★★ キャッシュになければAPIから取得 ★★★
    console.log('📡 APIから投稿取得開始...');
    
    const response = await fetch(`${this.apiBase}?action=post_detail`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        user_email: this.userEmail,
        post_id: postId
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log('📦 APIレスポンス:', data);
    
    if (data.success && data.post) {
      // 閲覧数をカウント
      this.incrementViewCount(postId);
      this.renderPostDetailModal(data.post);
    } else {
      // ★★★ APIが失敗した場合でもエラーにせず、警告のみ ★★★
      console.warn('⚠️ API未実装 - キャッシュデータのみ表示');
      throw new Error('この投稿は一覧から直接開いてください');
    }
    
  } catch (error) {
    console.error('投稿詳細表示エラー:', error);
    this.showTemporaryNotification(
      error.message || '投稿詳細の取得に失敗しました',
      'error'
    );
  }
}

async incrementViewCount(postId) {
  try {
    await fetch(`${this.apiBase}?action=increment_view_count`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        user_email: this.userEmail,
        post_id: postId
      })
    });
  } catch (error) {
    console.warn('閲覧数カウントエラー:', error);
  }
}
renderPostDetailModal(post) {
  this.closeAllModals();
  
  const timeAgo = this.getTimeAgo(post.created_at);
  const isOwnPost = post.user_email === this.userEmail;
  
  // ★ user_profilesの取得
  const userProfile = post.user_profiles || post.user_profile || null;
  
  // ★ 表示名とプロフィールURL
  const displayName = userProfile?.nickname || 
                     userProfile?.username || 
                     post.user_nickname ||
                     'botaple';
  
  const username = userProfile?.username;
  const profileUrl = username 
    ? `/pages/community?user=${encodeURIComponent(username)}`
    : null;
  
  const profileImageUrl = userProfile?.profile_image_url || null;
  
  console.log('📄 投稿詳細モーダル生成:', {
    post_id: post.id,
    displayName,
    profileUrl,
    profileImageUrl
  });
  
  const modalHtml = `
    <div id="post-detail-modal" class="modal-overlay" onclick="event.stopPropagation()">
      <div class="modal-content post-detail-modal-content" onclick="event.stopPropagation()">
        
        <!-- ヘッダー -->
        <div class="post-detail-header">
          <button onclick="window.plantApp.closePostDetailModal()" class="back-btn" type="button">
            ← 一覧に戻る
          </button>
          <h3>投稿詳細</h3>
          <button onclick="window.plantApp.closePostDetailModal()" class="close-btn" type="button">×</button>
        </div>
        
        <!-- 投稿本文 -->
        <div class="post-detail-body">
          
          <!-- ユーザー情報 -->
          <div class="post-author-info">
            ${profileImageUrl ? `
              <img src="${profileImageUrl}" alt="${this.escapeHtml(displayName)}" 
                   class="user-avatar-large" 
                   style="width: 60px; height: 60px; border-radius: 50%; object-fit: cover;">
            ` : `
              <span class="user-avatar-large"><img src="https://cdn.shopify.com/s/files/1/0658/5332/5495/files/blg2.png?v=1767146489" alt="ボタレコ" class="user-avatar-large" style="width: 60px; height: 60px; border-radius: 50%; object-fit: cover;"></span>
            `}
            <div class="author-details">
              ${profileUrl ? `
                <a href="${profileUrl}" 
                   class="author-nickname"
                   style="color: #333; text-decoration: none; font-weight: 600;">
                  ${this.escapeHtml(displayName)}
                </a>
              ` : `
                <span class="author-nickname" style="color: #999; font-weight: 600;">
                  ${this.escapeHtml(displayName)}
                </span>
              `}
              <span class="post-timestamp">${timeAgo} • ${this.formatDateTime(post.created_at)}</span>
            </div>
          </div>
          
          <!-- 植物名 -->
          <h2 class="post-plant-name">${this.escapeHtml(post.plant_name)}</h2>
          
          <!-- 画像 -->
          ${post.input_image_url ? `
            <div class="post-detail-image">
              <img src="${post.input_image_url}" 
                   alt="${this.escapeHtml(post.plant_name)}"
                   onclick="window.plantApp.showImageFullscreen('${post.input_image_url}', '${this.escapeHtml(post.plant_name)}')"
                   loading="lazy">
            </div>
          ` : ''}
          
          <!-- 記録内容 -->
          ${post.notes ? `
            <div class="post-detail-section">
              <h4>📝 記録・備考</h4>
              <p>${this.escapeHtml(post.notes)}</p>
            </div>
          ` : ''}
          
          <!-- 相談内容 -->
          ${post.consultation_request ? `
            <div class="post-detail-section">
              <h4>💡 相談内容</h4>
              <p>${this.escapeHtml(post.consultation_request)}</p>
            </div>
          ` : ''}
          
          <!-- AI回答 -->
          ${post.ai_response ? `
            <div class="post-detail-section ai-response-section">
              <h4>🤖 AI分析結果</h4>
              <div class="ai-response-full">${this.formatResponse(post.ai_response)}</div>
            </div>
          ` : ''}
          
          <!-- AI生成イラスト -->
          ${post.ai_generated_image_url ? `
            <div class="post-detail-section">
              <h4>🎨 ケアイラスト</h4>
              <div class="post-detail-image">
                <img src="${post.ai_generated_image_url}" 
                     alt="ケアイラスト"
                     onclick="window.plantApp.showImageFullscreen('${post.ai_generated_image_url}', 'ケアイラスト')"
                     loading="lazy">
              </div>
            </div>
          ` : ''}
          
          <!-- アクションボタン -->
<div class="post-detail-actions">
  <button class="action-btn-large ${post.user_has_liked ? 'liked' : ''}" 
          onclick="window.plantApp.toggleLikeInDetail('${post.id}')">
    ${post.user_has_liked ? '❤️' : '🤍'} ${post.like_count}
  </button>
  <button class="action-btn-large" style="flex: 1;">
    💬 ${post.comment_count}
  </button>
  
  ${isOwnPost ? `
    <button class="action-btn-large" style="flex: 1;">
      👁️ ${post.view_count}
    </button>
  ` : ''}
  
  ${post.thread_id ? `
    <button class="action-btn-large btn-growth-record" 
            onclick="window.plantApp.openGrowthRecordFromPost('${post.thread_id}', '${this.escapeHtml(post.plant_name)}', '${post.user_email}')">
      📈 成長記録を見る
    </button>
  ` : ''}
  
  ${isOwnPost ? `
    <button class="action-btn-large delete-btn" 
            onclick="window.plantApp.deletePublicPost('${post.id}')">
      🗑️ 削除
    </button>
  ` : ''}
</div>
          
          <!-- コメントセクション -->
          <div class="comments-section">
            <h4>💬 コメント (${post.comment_count || 0})</h4>
            
            <!-- コメント投稿フォーム -->
            <div class="comment-form">
              <textarea id="comment-text-${post.id}" 
                        placeholder="コメントを入力してください..."
                        rows="3"
                        maxlength="500"></textarea>
              <div class="comment-form-actions">
                <span class="char-count" id="char-count-${post.id}">0/500</span>
                <button onclick="window.plantApp.submitComment('${post.id}')" class="btn btn-primary">
                  コメントする
                </button>
              </div>
            </div>
            
            <!-- コメント一覧 -->
            <div id="comments-list-${post.id}" class="comments-list">
              <div class="loading">
                <div class="spinner"></div>
                <p>コメントを読み込み中...</p>
              </div>
            </div>
          </div>
          
        </div>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', modalHtml);
  
  // コメント一覧を読み込み
  this.loadPostComments(post.id);
  
  // 文字数カウンター
  const textarea = document.getElementById(`comment-text-${post.id}`);
  const charCount = document.getElementById(`char-count-${post.id}`);
  if (textarea && charCount) {
    textarea.addEventListener('input', () => {
      const length = textarea.value.length;
      charCount.textContent = `${length}/500`;
      charCount.style.color = length > 450 ? '#dc2626' : '#6b7280';
    });
  }
}

closePostDetailModal() {
  const modal = document.getElementById('post-detail-modal');
  if (modal) {
    modal.remove();
  }
  
  // SNSフィード一覧を更新（いいね数など反映）
  if (this.snsState && this.snsState.currentSort) {
    this.loadPublicPosts(this.snsState.currentSort, this.snsState.currentPage, false);
  }
}

async loadPostComments(postId) {
  const container = document.getElementById(`comments-list-${postId}`);
  if (!container) return;
  
  try {
    const response = await fetch(`${this.apiBase}?action=get_comments`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        user_email: this.userEmail,
        post_id: postId
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (data.success) {
      this.renderCommentsList(postId, data.comments || []);
    } else {
      throw new Error(data.error || 'コメントの取得に失敗しました');
    }
    
  } catch (error) {
    console.error('コメント取得エラー:', error);
    container.innerHTML = `
      <div class="empty-content">
        <p>コメントの読み込みに失敗しました</p>
      </div>
    `;
  }
}

renderCommentsList(postId, comments) {
  const container = document.getElementById(`comments-list-${postId}`);
  if (!container) return;
  
  if (comments.length === 0) {
    container.innerHTML = `
      <div class="no-comments">
        <p>まだコメントがありません</p>
        <p><small>最初のコメントを投稿してみませんか？</small></p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = comments.map(comment => {
    const isOwnComment = comment.user_email === this.userEmail;
    const timeAgo = this.getTimeAgo(comment.created_at);
    
    return `
      <div class="comment-item" data-comment-id="${comment.id}">
        <div class="comment-header">
          <span class="comment-avatar">🌱</span>
          <div class="comment-author-info">
            <span class="comment-author">${this.escapeHtml(comment.user_nickname || 'ユーザー')}</span>
            <span class="comment-time">${timeAgo}</span>
          </div>
          ${isOwnComment ? `
            <button class="comment-delete-btn" 
                    onclick="window.plantApp.deleteComment('${comment.id}', '${postId}')"
                    title="削除">
              🗑️
            </button>
          ` : ''}
        </div>
        <div class="comment-body">
          <p>${this.escapeHtml(comment.comment_text)}</p>
        </div>
      </div>
    `;
  }).join('');
}

async submitComment(postId) {
  const textarea = document.getElementById(`comment-text-${postId}`);
  const commentText = textarea?.value?.trim();
  
  if (!commentText) {
    this.showTemporaryNotification('コメントを入力してください', 'error');
    return;
  }
  
  if (commentText.length > 500) {
    this.showTemporaryNotification('コメントは500文字以内で入力してください', 'error');
    return;
  }
  
  try {
    const response = await fetch(`${this.apiBase}?action=add_comment`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        user_email: this.userEmail,
        post_id: postId,
        comment_text: commentText
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (data.success) {
      // テキストエリアをクリア
      if (textarea) {
        textarea.value = '';
        const charCount = document.getElementById(`char-count-${postId}`);
        if (charCount) charCount.textContent = '0/500';
      }
      
      // コメント一覧を再読み込み
      this.loadPostComments(postId);
      
      this.showTemporaryNotification('コメントを投稿しました', 'success');
      
    } else {
      throw new Error(data.error || 'コメントの投稿に失敗しました');
    }
    
  } catch (error) {
    console.error('コメント投稿エラー:', error);
    this.showTemporaryNotification(
      `コメントの投稿に失敗: ${error.message}`,
      'error'
    );
  }
}

async deleteComment(commentId, postId) {
  if (!confirm('このコメントを削除しますか？')) {
    return;
  }
  
  try {
    const response = await fetch(`${this.apiBase}?action=delete_comment`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        user_email: this.userEmail,
        comment_id: commentId
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (data.success) {
      // コメント一覧を再読み込み
      this.loadPostComments(postId);
      
      this.showTemporaryNotification('コメントを削除しました', 'success');
      
    } else {
      throw new Error(data.error || 'コメントの削除に失敗しました');
    }
    
  } catch (error) {
    console.error('コメント削除エラー:', error);
    this.showTemporaryNotification(
      `コメントの削除に失敗: ${error.message}`,
      'error'
    );
  }
}

async toggleLikeInDetail(postId) {
  await this.toggleLike(postId);
  
  // 詳細モーダル内のいいねボタンを更新
  const post = this.snsState.posts.find(p => p.id === postId);
  if (post) {
    const likeBtn = document.querySelector('.post-detail-actions .action-btn-large.liked, .post-detail-actions .action-btn-large:not(.delete-btn):first-child');
    if (likeBtn) {
      if (post.user_has_liked) {
        likeBtn.classList.add('liked');
        likeBtn.innerHTML = `❤️ ${post.like_count}`;
      } else {
        likeBtn.classList.remove('liked');
        likeBtn.innerHTML = `🤍 ${post.like_count}`;
      }
    }
  }
}

async deletePublicPost(postId) {
  if (!confirm('この投稿を削除しますか？\n\n削除すると、いいねやコメントも全て削除されます。')) {
    return;
  }
  
  try {
    const response = await fetch(`${this.apiBase}?action=delete_public_post`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        user_email: this.userEmail,
        post_id: postId
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (data.success) {
      this.showTemporaryNotification('投稿を削除しました', 'success');
      
      // モーダルを閉じる
      this.closeAllModals();
      
      // SNSフィード一覧を更新
      if (this.snsState && this.snsState.currentSort) {
        this.loadPublicPosts(this.snsState.currentSort, 1, false);
      }
      
    } else {
      throw new Error(data.error || '投稿の削除に失敗しました');
    }
    
  } catch (error) {
    console.error('投稿削除エラー:', error);
    this.showTemporaryNotification(
      `投稿の削除に失敗: ${error.message}`,
      'error'
    );
  }
}
async openGrowthRecordFromPost(threadId, plantName, ownerEmail) {
  try {
    console.log('📈 成長記録を開く:', { threadId, plantName, ownerEmail });
    this.openedFromSNS = true;
    console.log('📌 フラグ設定:', this.openedFromSNS);
    
    
    // ★ 投稿詳細の状態を保存
    this.returnToPostDetail = true;
    this.currentPostId = document.querySelector('#post-detail-modal')?.dataset?.postId || null;
    
    // 投稿詳細モーダルを閉じる
    const postDetailModal = document.getElementById('post-detail-modal');
    if (postDetailModal) {
      postDetailModal.remove();
    }
    
    // SNSフィードモーダルも閉じる
    const snsModal = document.getElementById('sns-feed-modal');
    if (snsModal) {
      snsModal.remove();
    }
    
    this.showLoadingModal('成長記録を読み込み中...');
    
    // 投稿データから直接スレッドデータを構築
    const threadData = {
      id: threadId,
      plant_name: plantName,
      user_email: ownerEmail,
      is_owner: ownerEmail === this.userEmail
    };
    
    // 投稿データを取得
    const posts = await this.loadThreadPosts(threadId);
    
    this.closeLoadingModal();
    
    // モーダルを表示
    this.currentOpenThread = threadData;
    this.renderAdvancedPlantRecordModal(threadData, posts);
    this.loadModalAdditionalData(threadId);
        console.log('📌 openGrowthRecordFromPost 終了時:', this.openedFromSNS);

  } catch (error) {
    this.closeLoadingModal();
    console.error('成長記録表示エラー:', error);
    this.showTemporaryNotification('成長記録の表示に失敗しました', 'error');
  }
}
async toggleLike(postId) {
  const membershipType = this.getMembershipType();
  if (membershipType === 'non_member') {
    this.showTemporaryNotification('いいね機能は会員限定です', 'error');
    return;
  }
  
  try {
    const response = await fetch(`${this.apiBase}?action=toggle_like`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        user_email: this.userEmail,
        post_id: postId
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (data.success) {
      // カード内のいいねボタンを更新
      const card = document.querySelector(`[data-post-id="${postId}"]`);
      if (card) {
        const likeBtn = card.querySelector('.action-btn');
        if (likeBtn) {
          if (data.liked) {
            likeBtn.classList.add('liked');
            likeBtn.innerHTML = `❤️ ${data.like_count}`;
          } else {
            likeBtn.classList.remove('liked');
            likeBtn.innerHTML = `🤍 ${data.like_count}`;
          }
        }
      }
      
      // snsState内の投稿データも更新
      const postInState = this.snsState.posts.find(p => p.id === postId);
      if (postInState) {
        postInState.user_has_liked = data.liked;
        postInState.like_count = data.like_count;
      }
      
    } else {
      throw new Error(data.error || 'いいね処理に失敗しました');
    }
    
  } catch (error) {
    console.error('いいねエラー:', error);
    this.showTemporaryNotification(
      `いいね処理に失敗: ${error.message}`,
      'error'
    );
  }
}
// ==========================================
// SNS機能関連メソッド ここまで
// ==========================================

  async executeDeletePost(postId, threadId = '') {
    const statusDiv = document.getElementById('delete-status');
    const deleteBtn = document.getElementById('delete-execute-btn');
    
    if (!statusDiv || !deleteBtn) {
      console.error('削除UI要素が見つかりません');
      return;
    }

    deleteBtn.disabled = true;
    deleteBtn.textContent = '削除処理中...';

    statusDiv.innerHTML = `
      <div class="loading-message">
        <div class="spinner"></div>
        <p>投稿を削除中...</p>
        <p><small>データベースから完全に削除しています...</small></p>
      </div>
    `;

    try {
      console.log('削除API呼び出し開始:', { 
        postId, 
        threadId, 
        userEmail: this.userEmail 
      });

      const response = await fetch(`${this.apiBase}?action=delete_post`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          user_email: this.userEmail,
          entitlement: this.entitlement,
          entitlement_snapshot: this.entitlementSnapshot,
          post_id: postId
        })
      });

      console.log('削除API応答:', {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries())
      });

      let data;
      const contentType = response.headers.get('content-type');
      
      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else {
        const textResponse = await response.text();
        console.error('非JSON応答:', textResponse);
        throw new Error(`予期しない応答形式: ${response.status} ${response.statusText}`);
      }

      console.log('削除処理結果:', data);

      if (data.success) {
        statusDiv.innerHTML = `
          <div class="success-message">
            <h5>✅ 削除完了</h5>
            <div class="deletion-result">
              <p><strong>削除された内容:</strong></p>
              <ul>
                <li>投稿ID: ${postId}</li>
                <li>投稿内容: 削除済み</li>
                <li>添付画像: 削除済み</li>
                <li>追加相談: ${data.deleted_follow_ups || 0}件削除</li>
                ${data.thread_deleted ? '<li><strong>植物記録全体も削除されました</strong></li>' : ''}
              </ul>
              ${data.remaining_posts_count !== undefined ? 
                `<p>この植物の残り記録数: ${data.remaining_posts_count}件</p>` : ''
              }
            </div>
          </div>
        `;

        this.showTemporaryNotification(
          data.thread_deleted ? '植物記録を完全に削除しました' : '投稿を削除しました', 
          'success'
        );

        setTimeout(async () => {
          this.closeAllModals();
          await this.refreshAfterDeletion(data.thread_deleted);
        }, 2500);

      } else {
        throw new Error(data.error || '削除処理に失敗しました');
      }

    } catch (error) {
      console.error('削除処理エラー:', error);
      
      statusDiv.innerHTML = `
        <div class="error-message">
          <h5>❌ 削除失敗</h5>
          <div class="error-details">
            <p><strong>エラー内容:</strong> ${error.message}</p>
            <p><strong>対処方法:</strong></p>
            <ul>
              <li>ネットワーク接続を確認してください</li>
              <li>ページを再読み込みして再試行してください</li>
              <li>問題が続く場合はサポートにお問い合わせください</li>
            </ul>
          </div>
          <div class="error-actions">
            <button onclick="window.plantApp.executeDeletePost('${postId}', '${threadId}')" 
                    class="btn btn-primary btn-small">
              再試行
            </button>
            <button onclick="window.plantApp.closeAllModals()" 
                    class="btn btn-secondary btn-small">
              閉じる
            </button>
          </div>
        </div>
      `;

      this.showTemporaryNotification('削除に失敗しました', 'error');
      
    } finally {
      deleteBtn.disabled = false;
      deleteBtn.textContent = '🗑️ 完全に削除する';
    }
  }
async deleteThread(threadId) {
  if (!confirm('この植物の育成記録を完全に削除しますか？\n（全ての投稿とケア記録が削除されます）')) {
    return;
  }

  try {
    console.log('植物カード削除開始:', threadId);

    const response = await fetch(
      `${this.apiBase}?action=delete_thread`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': this.supabaseAnonKey
        },
        body: JSON.stringify({
          user_email: this.userEmail,
          thread_id: threadId
        })
      }
    );

    const data = await response.json();
    console.log('削除処理結果:', data);

    if (data.success) {
      alert('植物カードを削除しました');
      
      // モーダルを閉じる
      this.closeAllModals();
      
      // UIから削除
      const card = document.querySelector(`[data-thread-id="${threadId}"]`);
      if (card) {
        card.remove();
      }
      
      // ページをリロードして最新状態を表示
      window.location.reload();
      
    } else {
      alert('削除に失敗しました: ' + (data.error || '不明なエラー'));
    }

  } catch (error) {
    console.error('植物カード削除エラー:', error);
    alert('削除中にエラーが発生しました');
  }
}
async deletePublicPost(postId) {
  if (!confirm('この投稿を削除しますか？\n削除すると、いいねやコメントも全て削除されます。')) {
    return;
  }

  try {
    console.log('🗑️ SNS投稿削除開始:', postId);

    const response = await fetch(
      `${this.apiBase}?action=delete_post`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': this.supabaseAnonKey
        },
        body: JSON.stringify({
          user_email: this.userEmail,
          post_id: postId
        })
      }
    );

    const data = await response.json();
    console.log('削除処理結果:', data);

    if (data.success) {
      alert('投稿を削除しました');
      
      // モーダルを閉じる
      this.closeAllModals();
      
      // SNS投稿一覧を再読み込み
      await this.loadPublicPosts();
      
    } else {
      alert('削除に失敗しました: ' + (data.error || '不明なエラー'));
    }

  } catch (error) {
    console.error('SNS投稿削除エラー:', error);
    alert('削除中にエラーが発生しました');
  }
}
  async refreshAfterDeletion(threadDeleted = false) {
    console.log('削除後更新処理:', { threadDeleted });
    
    try {
      await this.loadUserThreads();
      await this.loadExistingPlantsForSelection();
      
      if (this.currentOpenThread) {
        if (threadDeleted) {
          this.currentOpenThread = null;
          console.log('スレッド削除により記録モーダルを閉じます');
        } else {
          console.log('投稿削除によりモーダル内容を更新します');
          const modal = document.getElementById('plant-record-modal');
          if (modal) {
            try {
              const posts = await this.loadThreadPosts(this.currentOpenThread.id);
              const timelineContent = document.querySelector('[data-tab="timeline"].tab-content');
              if (timelineContent) {
                timelineContent.innerHTML = this.renderAdvancedTimelineTab(posts);
              }
            } catch (error) {
              console.error('モーダル内容更新エラー:', error);
            }
          }
        }
      }
      
      this.loadQuotaInfo();
      
    } catch (error) {
      console.error('削除後更新エラー:', error);
      this.showTemporaryNotification('データの再読み込みに失敗しました', 'error');
    }
  }

  showImageFullscreen(imageUrl, imageTitle = '') {
    this.closeAllModals();
    
    const modalHtml = `
      <div id="image-fullscreen-modal" class="image-modal-overlay" onclick="window.plantApp.closeImageModal(event)">
        <div class="image-modal-content" onclick="event.stopPropagation()">
          <div class="image-modal-header">
            <h4>${this.escapeHtml(imageTitle)}</h4>
            <button onclick="window.plantApp.closeAllModals()" class="image-modal-close">×</button>
          </div>
          <div class="image-modal-body">
            <img src="${imageUrl}" alt="${this.escapeHtml(imageTitle)}" class="full-image" loading="lazy">
          </div>
          <div class="image-modal-footer">
            <small>クリックまたはESCキーで閉じる</small>
          </div>
        </div>
      </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
  }

  closeImageModal(event) {
    if (event.target.classList.contains('image-modal-overlay')) {
      this.closeAllModals();
    }
  }

  showLoadingModal(message = '読み込み中...') {
    this.closeAllModals();
    
    const loadingHtml = `
      <div id="loading-modal" class="modal-overlay">
        <div class="modal-content loading-modal">
          <div class="loading-content">
            <div class="spinner"></div>
            <p>${this.escapeHtml(message)}</p>
          </div>
        </div>
      </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', loadingHtml);
  }

  closeLoadingModal() {
    const modal = document.getElementById('loading-modal');
    if (modal) {
      modal.remove();
    }
  }

  showErrorModal(message) {
    this.closeAllModals();
    
    const modalHtml = `
      <div id="error-modal" class="modal-overlay">
        <div class="modal-content error-modal">
          <div class="modal-header">
            <h3>エラーが発生しました</h3>
            <button onclick="window.plantApp.closeAllModals()" class="close-btn">×</button>
          </div>
          <div class="modal-body">
            <div class="error-content">
              <p>${this.escapeHtml(message)}</p>
            </div>
            <div class="error-actions">
              <button onclick="window.plantApp.closeAllModals()" class="btn btn-secondary">
                閉じる
              </button>
              <a href="/pages/contact" class="btn btn-primary" target="_blank">
                サポートに連絡
              </a>
            </div>
          </div>
        </div>
      </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
  }

  closeAllModals() {
    const modals = [
      'loading-modal',
      'error-modal',
      'plant-record-modal',
      'image-fullscreen-modal',
      'add-care-modal',
      'follow-up-modal',
      'care-guide-modal',
      'delete-confirm-modal',
      'care-settings-modal',
      'todays-care-modal',
    'illustration-limit-modal',
    'consultation-limit-modal'
    ];
    
    modals.forEach(modalId => {
      const modal = document.getElementById(modalId);
      if (modal) {
        modal.remove();
      }
    });

    document.removeEventListener('keydown', this.handleEscapeKey);
    console.log('全モーダル閉じ完了');
  }

  showTemporaryNotification(message, type = 'info', duration = 3000) {
    const existingNotifications = document.querySelectorAll('.temporary-notification');
    existingNotifications.forEach(notif => notif.remove());

    const notification = document.createElement('div');
    notification.className = `temporary-notification ${type}`;

    const styles = {
      success: { bg: '#d4edda', border: '#c3e6cb', color: '#155724' },
      error: { bg: '#f8d7da', border: '#f5c6cb', color: '#721c24' },
      info: { bg: '#d1ecf1', border: '#bee5eb', color: '#0c5460' },
      warning: { bg: '#fff3cd', border: '#ffeaa7', color: '#856404' }
    };

    const style = styles[type] || styles.info;

    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: ${style.bg};
      border: 1px solid ${style.border};
      color: ${style.color};
      padding: 12px 16px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 2000;
      max-width: 350px;
      font-size: 14px;
      font-weight: 500;
      animation: slideInNotification 0.3s ease;
    `;

    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
      if (notification.parentNode) {
        notification.style.animation = 'slideOutNotification 0.3s ease';
        setTimeout(() => {
          if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
          }
        }, 300);
      }
    }, duration);
  }


displayFollowUpRecommendations(data) {
  let recommendationsHtml = '';
  
  if (data.product_recommendations && data.product_recommendations.length > 0) {
    recommendationsHtml += `
      <div class="follow-up-recommendations">
        <h6>追加相談に基づくおすすめ商品</h6>
        <div class="recommendations-grid">
          ${data.product_recommendations.map(product => `
            <div class="mini-recommendation-item ${product.is_pr ? 'pr-item' : ''}">
              <div class="mini-rec-header">
                <strong>${this.escapeHtml(product.product_name)}</strong>
                ${product.is_pr ? '<span class="mini-pr-badge">PR</span>' : ''}
              </div>
              ${product.price_range ? `<div class="mini-price">${this.escapeHtml(product.price_range)}</div>` : ''}
              <a href="${product.product_url}" target="_blank" class="btn btn-mini">商品を見る</a>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }
  
  if (data.article_recommendations && data.article_recommendations.length > 0) {
    recommendationsHtml += `
      <div class="follow-up-articles">
        <h6>関連記事</h6>
        <div class="articles-list">
          ${data.article_recommendations.map(article => `
            <div class="mini-article-item">
              <strong>${this.escapeHtml(article.title)}</strong>
              <a href="${article.url}" target="_blank" class="btn btn-mini">記事を読む</a>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }
  
  if (recommendationsHtml) {
    setTimeout(() => {
      const followUpModal = document.getElementById('follow-up-modal');
      if (followUpModal) {
        const modalBody = followUpModal.querySelector('.modal-body');
        if (modalBody) {
          modalBody.insertAdjacentHTML('beforeend', recommendationsHtml);
        }
      }
    }, 500);
  }
}

  showError(message) {
    console.error('エラー表示:', message);
    const statusDiv = document.getElementById('form-status');
    if (statusDiv) {
      statusDiv.innerHTML = `
        <div class="error-message">
          <h5>エラーが発生しました</h5>
          <p>${this.escapeHtml(message)}</p>
        </div>
      `;
    }
    this.showTemporaryNotification(message, 'error');
  }

  reportError(error, context = '') {
    const errorReport = {
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href,
      userEmail: this.userEmail,
      membershipType: this.getMembershipType(),
      context: context,
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name
      },
      appVersion: 'Complete-Integrated-v17.1.0',
      features: {
        nano_banana: true,
        care_records: true,
        care_alerts: true,
        care_settings: true,
        growth_comparison: true,
        follow_up: true,
        delete_function: true
      }
    };
    
    console.error('完全統合版エラー報告:', errorReport);
    
    if (this.userEmail && this.getMembershipType() !== 'non_member') {
      fetch(`${this.apiBase}?action=error_report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(errorReport)
      }).catch(e => console.warn('エラー報告送信失敗:', e));
    }
  }

async performSystemIntegrityCheck() {
  console.log('🔍 システム整合性チェック開始');
  
  const checks = {
    imageGeneration: this.shouldGenerateIllustration && this.requestServerIllustrationPatch,  // ★ 修正！
    careRecords: this.loadCareRecords && this.saveCareRecord,
    careAlerts: this.loadCareAlerts && this.markCareAsDone,
    careSettings: this.loadCareSettings && this.saveCareSettings,
    growthComparison: this.loadGrowthImages && this.calculateGrowthRate,
    followUp: this.submitFollowUp && this.loadFollowUpHistory,
    deleteFunction: this.confirmDeletePost && this.executeDeletePost,
    modalSystem: this.openPlantRecord && this.closeAllModals
  };
  
  const results = {};
  for (const [feature, isImplemented] of Object.entries(checks)) {
    results[feature] = !!isImplemented;
  }
  
  console.log('✅ システム整合性チェック結果:', results);
  
  const allFeaturesImplemented = Object.values(results).every(Boolean);
  if (allFeaturesImplemented) {
    console.log('🎉 全機能が正常に実装されています');
  } else {
    console.warn('⚠️ 一部機能が未実装です:', Object.entries(results).filter(([k,v]) => !v));
  }
  
  return results;
}

  formatResponse(response) {
    if (!response) return '';
    return response
      .replace(/\n/g, '<br>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code>$1</code>');
  }

  escapeHtml(text) {
    if (typeof text !== 'string') return String(text || '');
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  formatDate(dateString) {
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return dateString;
      return date.toLocaleDateString('ja-JP', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch (error) {
      console.error('日付フォーマットエラー:', error, dateString);
      return dateString;
    }
  }

  formatDateTime(dateString) {
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return dateString;
      return date.toLocaleString('ja-JP', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (error) {
      console.error('日時フォーマットエラー:', error, dateString);
      return dateString;
    }
  }

async loadQuotaInfo(forceRefresh = false) {
  const membershipType = this.getMembershipType();
  const el = document.getElementById('quota-display');
  if (!el) return;
  
  if (membershipType === 'non_member') {
    el.innerHTML = '<span>体験版: 制限あり</span>';
    return;
  }
  
  // キャッシュチェック
  if (!forceRefresh && this._quotaCache && Date.now() < this._quotaCacheExpiry) {
    this.applyQuotaFromResponse(this._quotaCache);
    return;
  }
  
  // 二重読み込み防止
  if (this._quotaLoading) return;
  this._quotaLoading = true;
  
  try {
    const response = await fetch(`${this.apiBase}?action=quota`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.SUPABASE_ANON_KEY}`,
        'apikey': this.SUPABASE_ANON_KEY,
        'x-client-info': 'botareco-web'
      },
      body: JSON.stringify({
        user_email: this.userEmail
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    
    if (data.success) {
      this._quotaCache = data;
      this._quotaCacheExpiry = Date.now() + 30000;
      this.applyQuotaFromResponse(data);
    }
  } catch (error) {
    console.error('クオータ情報取得エラー:', error);
  } finally {
    this._quotaLoading = false;
  }
}



  attachEventListeners() {
    const imageInput = document.getElementById('plant-image');
    if (imageInput) {
      imageInput.addEventListener('change', (e) => {
        this.handleImagePreview(e.target.files[0]);
      });
    }

    const form = document.getElementById('consultation-form');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.submitConsultation();
      });
    }

    this.attachPlantSelectionEvents();
    this.attachGlobalKeyboardEvents();

  const consultationTextarea = document.getElementById('consultation');
  const illustrationCheckbox = document.getElementById('enable-illustration-checkbox');
  
  if (consultationTextarea && illustrationCheckbox) {
    const updateIllustrationCheckbox = () => {
      const hasConsultation = consultationTextarea.value.trim().length > 0;
      illustrationCheckbox.disabled = !hasConsultation;
      
      if (!hasConsultation) {
        illustrationCheckbox.checked = false;
        illustrationCheckbox.parentElement.style.opacity = '0.5';
      } else {
        illustrationCheckbox.checked = true;
        illustrationCheckbox.parentElement.style.opacity = '1';
      }
    };
    
    consultationTextarea.addEventListener('input', updateIllustrationCheckbox);
    // 初期状態も設定
    setTimeout(updateIllustrationCheckbox, 100);
  }
    console.log('イベントリスナー初期化完了');
  }
initNewHeader() {
  const membershipType = this.getMembershipType();
  
  // 会員種別バッジの更新
  const planBadge = document.getElementById('brPlanBadge');
  if (planBadge) {
    const membershipLabels = {
      non_member: '体験版',
      free_member: '無料会員',
      paid_member: '有料会員'
    };
    planBadge.textContent = membershipLabels[membershipType] || '体験版';
  }
  
  // 季節バッジの更新
  const seasonBadge = document.getElementById('brSeasonBadge');
  if (seasonBadge) {
    const now = new Date();
    const month = now.getMonth() + 1;
    
    let seasonEmoji = '🍂';
    let seasonName = '秋';
    
    if (month >= 3 && month <= 5) {
      seasonEmoji = '🌸';
      seasonName = '春';
    } else if (month >= 6 && month <= 8) {
      seasonEmoji = '☀️';
      seasonName = '夏';
    } else if (month >= 9 && month <= 11) {
      seasonEmoji = '🍂';
      seasonName = '秋';
    } else {
      seasonEmoji = '❄️';
      seasonName = '冬';
    }
    
    seasonBadge.textContent = `${seasonEmoji} ${seasonName}`;
  }
  
  // ★★★ ユーザー名の更新（Supabase最優先） ★★★
  this.loadUserNicknameFromSupabase();
  
  // クォータ情報の表示
  const quotasDiv = document.getElementById('brQuotas');
  if (quotasDiv && membershipType === 'non_member') {
    quotasDiv.innerHTML = `
      <div style="padding: 8px; background: #fff3cd; border: 1px solid #ffc107; border-radius: 6px; font-size: 13px;">
        <strong>🔒 体験版</strong><br>
        <small>AI相談: 月5回まで</small><br>
        <small>植物登録: 不可</small><br>
        <a href="/customer_authentication/login" style="color: #0066cc; text-decoration: underline;">ログインして制限解除</a>
      </div>
    `;
  } else if (quotasDiv && membershipType === 'free_member') {
    quotasDiv.innerHTML = `
      <div style="padding: 8px; background: #e7f3ff; border: 1px solid #0066cc; border-radius: 6px; font-size: 13px;">
        <strong>🆓 無料会員</strong><br>
        <small>AI相談: 月30回まで</small><br>
        <small>植物登録: 20個まで</small><br>
        <a href="/products/leafla-subscription" style="color: #7c3aed; text-decoration: underline;">有料プランで全機能解放</a>
      </div>
    `;
  }
  
  this.addSNSButtonToPopover();
}

async loadUserNicknameFromSupabase() {
  const userNameElements = [
    document.getElementById('brUserName'),
    document.getElementById('brSummaryName')
  ];
  
  // ★★★ デフォルト値の優先順位 ★★★
  let defaultName = 'ゲスト';
  
  // Shopifyの名前があればそれを使う
  if (window.LEAFLA?.customer?.first_name) {
    defaultName = window.LEAFLA.customer.first_name;
  } 
  // なければメールアドレスの@前
  else if (this.userEmail) {
    defaultName = this.userEmail.split('@')[0];
  }
  
  // まずデフォルト名を表示（ちらつき防止）
  userNameElements.forEach(el => {
    if (el) {
      el.textContent = defaultName + ' さん';
    }
  });
  
  console.log('🔍 デフォルト名表示:', defaultName);
  
  // 非会員・未ログインの場合はここで終了
  if (!this.userEmail || this.getMembershipType() === 'non_member') {
    console.log('ℹ️ 非会員のためSupabase取得スキップ');
    return;
  }
  
  // ★★★ Supabaseからnicknameを取得（最優先） ★★★
  try {
    console.log('📡 Supabaseからニックネーム取得中...');
    
    const response = await fetch(
      `https://laixgcjvowdszrtdpxlq.supabase.co/rest/v1/user_profiles?user_email=eq.${encodeURIComponent(this.userEmail)}&select=nickname`,
      {
        headers: {
          'apikey': this.SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${this.SUPABASE_ANON_KEY}`,
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      }
    );
    
    if (!response.ok) {
      console.warn('⚠️ プロフィール取得失敗:', response.status);
      return;
    }
    
    const data = await response.json();
    
    if (data && data.length > 0 && data[0].nickname) {
      const nickname = data[0].nickname;
      console.log('✅ Supabaseからニックネーム取得成功:', nickname);
      
      // ★★★ Supabaseのnicknameで上書き ★★★
      userNameElements.forEach(el => {
        if (el) {
          el.textContent = nickname + ' さん';
        }
      });
    } else {
      console.log('ℹ️ Supabaseにnicknameなし → デフォルト名のまま');
    }
    
  } catch (error) {
    console.warn('❌ ニックネーム取得エラー:', error);
    // エラーでもデフォルト名のまま継続
  }
}
// ★★★ 新規メソッド：SNSボタンを動的追加 ★★★
addSNSButtonToPopover() {
  const membershipType = this.getMembershipType();
  
  // 非会員の場合はボタンを追加しない
  if (membershipType === 'non_member') {
    return;
  }
  
  // ポップオーバー内のボタンリストを探す
  const popover = document.getElementById('brUserPopover');
  if (!popover) {
    console.warn('brUserPopover が見つかりません');
    return;
  }
  
  // 既存のSNSボタンがあれば削除
  const existingSNSBtn = document.getElementById('brSNSBtn');
  if (existingSNSBtn) {
    existingSNSBtn.remove();
  }
  
  // ★ 修正：.br-actions内の「閉じる」ボタンを探す
  const actionsContainer = popover.querySelector('.br-actions');
  if (!actionsContainer) {
    console.warn('.br-actions が見つかりません');
    return;
  }
  
  const closeBtn = actionsContainer.querySelector('button[data-close]');
  if (!closeBtn) {
    console.warn('.br-actions内の閉じるボタンが見つかりません');
    return;
  }
  
  // SNSボタンを作成
  const snsBtn = document.createElement('button');
  snsBtn.id = 'brSNSBtn';
  snsBtn.className = 'br-action'; // 基本クラスを適用
  snsBtn.innerHTML = 'SNS';
  
  // クリックイベントを追加
  snsBtn.addEventListener('click', () => {
    // ポップオーバーを閉じる
    popover.hidden = true;
    const userBtn = document.getElementById('brUserBtn');
    if (userBtn) {
      userBtn.setAttribute('aria-expanded', 'false');
    }
    
    // SNSフィードを開く
    this.openSNSFeed();
  });
  
  // .br-actions内の「閉じる」ボタンの直前に挿入
  actionsContainer.insertBefore(snsBtn, closeBtn);
  
  console.log('✅ SNSボタンを.br-actions内に追加しました');
}
  attachPlantSelectionEvents() {
    const selectionRadios = document.querySelectorAll('input[name="plant_selection_type"]');
    const existingDropdown = document.getElementById('existing-plants-dropdown');
    const plantNameInput = document.getElementById('plant-name');
    
    if (!selectionRadios.length) return;

    selectionRadios.forEach(radio => {
      radio.addEventListener('change', (e) => {
        console.log('植物選択モード変更:', e.target.value);
        
        if (e.target.value === 'existing') {
          if (existingDropdown) {
            existingDropdown.style.display = 'block';
          }
          if (plantNameInput) {
            plantNameInput.disabled = true;
            plantNameInput.value = '';
            plantNameInput.placeholder = '植物を選択すると自動入力されます';
          }
          this.updateExistingPlantsDropdown();
        } else {
          if (existingDropdown) {
            existingDropdown.style.display = 'none';
          }
          if (plantNameInput) {
            plantNameInput.disabled = false;
            plantNameInput.value = '';
            plantNameInput.placeholder = '例: ビカクシダ、リドレイ、多肉植物、ポトス';
          }
          this.lastSelectedPlant = null;
        }
      });
    });

    const existingSelect = document.getElementById('existing-plant-select');
    if (existingSelect) {
      existingSelect.addEventListener('change', (e) => {
        const selectedOption = e.target.selectedOptions[0];
        if (selectedOption && selectedOption.dataset.plantName && plantNameInput) {
          const plantName = selectedOption.dataset.plantName;
          plantNameInput.value = plantName;
          
          this.lastSelectedPlant = {
            id: selectedOption.value,
            name: plantName,
            postsCount: selectedOption.dataset.postsCount || 0,
            activity: selectedOption.dataset.activity || 'unknown'
          };
          
          console.log('植物選択記録:', this.lastSelectedPlant);
        }
      });
    }
  }

  attachGlobalKeyboardEvents() {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeAllModals();
        this.currentOpenThread = null;
      }
      
      if (e.ctrlKey && e.key === 'Enter') {
        const form = document.getElementById('consultation-form');
        if (form && !document.querySelector('.modal-overlay')) {
          e.preventDefault();
          this.submitConsultation();
        }
      }
    });
  }

  handleImagePreview(file) {
    const preview = document.getElementById('image-preview');
    if (!preview) return;

    if (!file) {
      preview.innerHTML = '';
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      preview.innerHTML = '<p class="error">ファイルサイズが大きすぎます（10MB以下にしてください）</p>';
      return;
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      preview.innerHTML = '<p class="error">対応していない画像形式です（JPEG、PNG、WebP対応）</p>';
      return;
    }

    const membershipType = this.getMembershipType();
    const reader = new FileReader();
    
    reader.onload = (e) => {
      preview.innerHTML = `
        <div class="image-preview-container">
          <img src="${e.target.result}" alt="プレビュー">
          <div class="preview-info">
            <p class="file-info">
              ${file.name}<br>
              サイズ: ${(file.size / 1024 / 1024).toFixed(2)}MB
            </p>
            <p class="storage-info">
              ${membershipType !== 'non_member' ? 
                '✓ この写真は保存されます' : 
                '⚠ 非会員では写真保存されません'
              }
            </p>
          </div>
        </div>
      `;
    };
    
    reader.readAsDataURL(file);
  }

  debugFormState() {
    const plantNameInput = document.getElementById('plant-name');
    const existingRadio = document.getElementById('radio-existing');
    const newRadio = document.getElementById('radio-new');
    const existingSelect = document.getElementById('existing-plant-select');
    
    const debugInfo = {
      plantName: plantNameInput?.value,
      plantNameDisabled: plantNameInput?.disabled,
      plantNamePlaceholder: plantNameInput?.placeholder,
      existingRadioChecked: existingRadio?.checked,
      newRadioChecked: newRadio?.checked,
      selectedPlantId: existingSelect?.value,
      selectedPlantName: existingSelect?.selectedOptions[0]?.dataset?.plantName,
      lastSelectedPlant: this.lastSelectedPlant,
      availableOptions: Array.from(existingSelect?.options || []).map(opt => ({
        value: opt.value,
        text: opt.text,
        plantName: opt.dataset.plantName,
        postsCount: opt.dataset.postsCount
      })),
      membershipType: this.getMembershipType(),
      currentSeason: this.getCurrentSeasonInfo()
    };

    console.log('フォーム状態デバッグ情報:', debugInfo);
    return debugInfo;
  }

  restorePlantSelection() {
    if (!this.lastSelectedPlant) return;
    console.log('植物選択状態復元処理開始:', this.lastSelectedPlant);

    let attempts = 0;
    const maxAttempts = 5;

    const attemptRestore = () => {
      attempts++;
      console.log(`復元試行 ${attempts}/${maxAttempts}`);
      
      const existingRadio = document.getElementById('radio-existing');
      const newRadio = document.getElementById('radio-new');
      const existingSelect = document.getElementById('existing-plant-select');
      const plantNameInput = document.getElementById('plant-name');
      const existingDropdown = document.getElementById('existing-plants-dropdown');
      
      if (!existingRadio || !existingSelect || !plantNameInput) {
        if (attempts < maxAttempts) {
          setTimeout(attemptRestore, 100);
          return;
        }
        console.error('必要な要素が見つかりません - 復元を中止');
        return;
      }
      
      try {
        existingRadio.checked = true;
        if (newRadio) newRadio.checked = false;
        
        if (existingDropdown) {
          existingDropdown.style.display = 'block';
        }
        
        plantNameInput.disabled = true;
        plantNameInput.value = this.lastSelectedPlant.name;
        plantNameInput.placeholder = '選択した植物: ' + this.lastSelectedPlant.name;
        
        const targetOption = Array.from(existingSelect.options).find(
          option => option.value === this.lastSelectedPlant.id
        );
        
        if (targetOption) {
          existingSelect.value = this.lastSelectedPlant.id;
          console.log('植物選択状態復元完了:', {
            selectedId: existingSelect.value,
            selectedName: plantNameInput.value,
            radioChecked: existingRadio.checked,
            activity: this.lastSelectedPlant.activity
          });
        } else {
          console.warn('対象の植物オプションが見つかりません - リスト更新を待機');
          if (attempts < maxAttempts) {
            setTimeout(attemptRestore, 200);
            return;
          }
          console.error('植物選択復元失敗: オプションが見つかりません');
        }
        
      } catch (error) {
        console.error('植物選択状態復元エラー:', error);
      }
    };

    setTimeout(attemptRestore, 100);
  }
showIllustrationLimitModal(limitData) {
  this.closeAllModals();
  
  const modalHtml = `
    <div id="illustration-limit-modal" class="modal-overlay" onclick="event.stopPropagation()">
      <div class="modal-content" onclick="event.stopPropagation()">
        <div class="modal-header">
          <h3>イラスト生成の月間上限に達しました</h3>
          <button onclick="window.plantApp.closeAllModals()" class="close-btn">×</button>
        </div>
        <div class="modal-body">
          <div class="limit-info">
            <h4>現在の利用状況</h4>
            <div class="usage-stats">
              <div class="stat">
                <span class="label">今月の利用回数</span>
                <span class="value">${limitData.current_usage}回</span>
              </div>
              <div class="stat">
                <span class="label">月間上限</span>
                <span class="value">${limitData.monthly_limit}回</span>
              </div>
              <div class="stat">
                <span class="label">追加パック</span>
                <span class="value">${limitData.additional_pack_count}パック購入済み</span>
              </div>
            </div>
          </div>
          
          <div class="options">
            <h4>解決方法</h4>
            
            <div class="option-card">
              <h5>追加イラストパック購入</h5>
              <div class="option-details">
                <p><strong>${limitData.upgrade_options.additional_pack_price}</strong>で<strong>${limitData.upgrade_options.additional_pack_illustrations}回</strong>追加</p>
                <p>今月限定で即座に利用可能</p>
              </div>
              <button class="btn btn-primary" onclick="window.plantApp.purchaseAdditionalPack()">
                追加パックを購入する
              </button>
            </div>
            
            <div class="option-card">
              <h5>来月まで待つ</h5>
              <div class="option-details">
                <p>月間上限は毎月リセットされます</p>
                <p>それまでは通常の相談機能をご利用ください</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', modalHtml);
}

showConsultationLimitModal(errorData = {}) {
  this.closeAllModals();
  
  const membershipType = this.getMembershipType();
  
  // ★★★ 正しいリセット日計算 ★★★
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const resetDate = `${nextMonth.getFullYear()}年${nextMonth.getMonth() + 1}月1日`;
  
  // 非会員・無料会員の場合
  if (membershipType !== 'paid_member') {
    const modalHtml = `
      <div id="consultation-limit-modal" class="modal-overlay" onclick="window.plantApp.closeAllModals()">
        <div class="modal-content" onclick="event.stopPropagation()">
          <div class="modal-header">
            <h3>🌿 AI相談機能は有料会員限定です</h3>
            <button onclick="window.plantApp.closeAllModals()" class="close-btn">×</button>
          </div>
          
          <div class="modal-body">
            <div class="upgrade-benefits">
              <h4>月額300円で使い放題</h4>
              <ul>
                <li>✅ AI植物相談（月150回）</li>
                <li>✅ AIケアイラスト（月20回）</li>
                <li>✅ 季節対応ケア通知</li>
                <li>✅ 植物50個まで登録</li>
              </ul>
            </div>
            
            <div class="form-actions">
              <a href="https://leaf-laboratory.com/products/leafla-subscription" class="btn btn-primary btn-large">
                🌿 有料会員に登録する
              </a>
              <button onclick="window.plantApp.closeAllModals()" class="btn btn-secondary">
                閉じる
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    return;
  }
  
  // 有料会員の場合
  const currentUsage = errorData.current_usage || errorData.used || '?';
  const monthlyLimit = errorData.monthly_limit || errorData.limit || 150;
  const additionalPackCount = errorData.additional_pack_count || errorData.additional_packs || 0;
  
  const modalHtml = `
    <div id="consultation-limit-modal" class="modal-overlay" onclick="window.plantApp.closeAllModals()">
      <div class="modal-content" onclick="event.stopPropagation()">
        <div class="modal-header">
          <h3>🚫 今月の相談回数上限に達しました</h3>
          <button onclick="window.plantApp.closeAllModals()" class="close-btn">×</button>
        </div>
        
        <div class="modal-body">
          <div class="limit-warning">
            <h4>現在の利用状況</h4>
            <div class="usage-stats">
              <div class="stat-row">
                <span class="stat-label">使用回数:</span>
                <span class="stat-value highlight">${currentUsage} / ${monthlyLimit}回</span>
              </div>
              <div class="stat-row">
                <span class="stat-label">追加パック購入:</span>
                <span class="stat-value">${additionalPackCount}個</span>
              </div>
              <div class="stat-row">
                <span class="stat-label">リセット日:</span>
                <span class="stat-value">${resetDate}</span>
              </div>
            </div>
          </div>
          
          <div class="upgrade-suggestion">
            <h4>💡 追加パックで相談回数を増やせます</h4>
            <div class="pack-info">
              <p class="pack-price"><strong>¥1,000</strong></p>
              <p class="pack-benefit">+100回の相談が可能</p>
            </div>
            
            <div class="purchase-action">
              <a href="https://leaf-laboratory.com/products/botareco-consultation-pack" class="btn btn-primary btn-large" target="_blank">
                🛒 追加パックを購入
              </a>
            </div>
          </div>
          
          <div class="alternatives">
            <h5>その他の選択肢</h5>
            <ul>
              <li>${resetDate}に上限がリセットされます</li>
              <li>記録のみ投稿（相談内容を空欄）は回数制限なし</li>
              <li>既存の投稿に対する追加相談（各投稿5回まで）も可能</li>
            </ul>
          </div>
          
          <div class="form-actions">
            <button onclick="window.plantApp.closeAllModals()" class="btn btn-secondary">
              閉じる
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', modalHtml);
}


purchaseConsultationPack() {
  window.open('/products/botareco-consultation-pack', '_blank');
  this.closeAllModals();
}

purchaseAdditionalPack() {
  window.open('/products/botareco-additional-pack', '_blank');
  this.closeAllModals();
}
}  


// CSS動的追加
const appDynamicCSS = `
/*style*/
`;

if (!document.querySelector('#leafla-app-styles')) {
  const styleSheet = document.createElement('style');
  styleSheet.id = 'leafla-app-styles';
  styleSheet.textContent = appDynamicCSS;
  document.head.appendChild(styleSheet);
}

// グローバル初期化
(function() {
  'use strict';
  
  if (typeof window === 'undefined') {
    console.warn('Window object not available');
    return;
  }

  if (window.plantApp) {
    console.log('既存のPlantAppインスタンスをクリーンアップ');
    if (typeof window.plantApp.closeAllModals === 'function') {
      window.plantApp.closeAllModals();
    }
  }

  try {
    window.plantApp = new PlantConsultationApp();
    
    setTimeout(() => {
      if (window.plantApp.performSystemIntegrityCheck) {
        window.plantApp.performSystemIntegrityCheck();
      }
    }, 1000);
    
    console.log('✅ LEAFLA植物育成記録アプリ 完全統合版 v17.1.0 初期化完了');
    console.log('🔧 統合実装機能一覧:');
    console.log('  ✓ 画像生成（Gemini 2.5-flash-image-preview）');
    console.log('  ✓ 植物記録詳細モーダル（4タブ構成）');
    console.log('  ✓ 追加相談機能（完全履歴対応）');
    console.log('  ✓ ケア記録機能（care_recordsテーブル統合）');
    console.log('  ✓ ケア通知・アラート機能（有料会員限定・季節対応）');
    console.log('  ✓ 成長記録比較機能（統計分析付き）');
    console.log('  ✓ 削除機能（完全版）');
    console.log('  ✓ ケア設定カスタマイズ（有料会員限定・保存ボタン完全修正）');
    console.log('  ✓ 季節対応システム（TypeScript v17.1.0準拠）');
    console.log('  ✓ 会員制度統合管理');
    console.log('  ✓ エラー報告システム');
    console.log('  ✓ システム整合性チェック');
    
  } catch (error) {
    console.error('❌ 植物育成記録アプリの初期化に失敗:', error);
    
    window.plantApp = {
      showError: function(message) {
        console.error('PlantApp Error:', message);
        alert('エラー: ' + message);
      },
      closeAllModals: function() {
        const modals = document.querySelectorAll('.modal-overlay');
        modals.forEach(modal => modal.remove());
      },
      showTemporaryNotification: function(message, type = 'error') {
        console.log(`Notification [${type}]: ${message}`);
        const notification = document.createElement('div');
        notification.textContent = message;
        notification.style.cssText = `
          position: fixed; top: 20px; right: 20px; z-index: 9999;
          background: #f8d7da; color: #721c24; padding: 12px;
          border-radius: 4px; border: 1px solid #f5c6cb;
        `;
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 3000);
      },
      confirmDeletePost: function() { console.log('Delete function fallback'); },
      submitFollowUp: function() { console.log('Follow-up function fallback'); },
      showFollowUpModal: function() { console.log('Follow-up modal fallback'); },
      showAddCareModal: function() { console.log('Care modal fallback'); },
      showCareSettingsModal: function() { console.log('Care settings fallback'); },
      openPlantRecord: function() { console.log('Plant record fallback'); },
      showImageFullscreen: function() { console.log('Image fullscreen fallback'); },
      markCareAsDone: function() { console.log('Care done fallback'); },
      loadCareRecords: function() { console.log('Care records fallback'); },
      loadGrowthImages: function() { console.log('Growth images fallback'); },
      saveCareSettings: function() { console.log('Save care settings fallback'); }
    };
  }
  
  window.addEventListener('error', function(e) {
    console.error('🚨 Global JavaScript Error:', {
      message: e.message,
      filename: e.filename,
      lineno: e.lineno,
      colno: e.colno,
      error: e.error,
      timestamp: new Date().toISOString()
    });
    
    if (window.plantApp && typeof window.plantApp.reportError === 'function') {
      window.plantApp.reportError(e.error, 'Global error handler');
    }
  });
  
  window.addEventListener('unhandledrejection', function(e) {
    console.error('🚨 Unhandled Promise Rejection:', {
      reason: e.reason,
      promise: e.promise,
      timestamp: new Date().toISOString()
    });
    
    if (window.plantApp && typeof window.plantApp.reportError === 'function') {
      const error = new Error('Unhandled Promise Rejection: ' + String(e.reason));
      window.plantApp.reportError(error, 'Unhandled promise rejection');
    }
  });

})();
// ===== 新ヘッダー制御JS =====
(function() {
  var $ = function(sel) { return document.querySelector(sel); };
  var btn = $('#brUserBtn');
  var pop = $('#brUserPopover');
  var sheet = $('#brSheet');
  
  if (!btn || !pop) {
    console.log('brUserBtn または brUserPopover が見つかりません');
    return;
  }

function updateStats() {
  var totalRecords = $('#total-records');
  var consultations = $('#consultation-count');
  var period = $('#growth-period');
  var todayCare = $('#todays-care-count');
  var quota = $('#quota-display');
  
  if ($('#brTotalRecords')) $('#brTotalRecords').textContent = totalRecords ? totalRecords.textContent : '0';
  if ($('#brConsultations')) $('#brConsultations').textContent = consultations ? consultations.textContent : '0';
  if ($('#brPeriod')) $('#brPeriod').textContent = period ? period.textContent : '—';
  if ($('#brTodayCare')) $('#brTodayCare').textContent = todayCare ? todayCare.textContent : '0';
  
  if (quota && $('#brQuotas')) $('#brQuotas').innerHTML = quota.innerHTML;
  
  // ★★★ ユーザー名も更新（plantAppから取得） ★★★
  if (window.plantApp && window.plantApp.loadUserNicknameFromSupabase) {
    window.plantApp.loadUserNicknameFromSupabase();
  }
}

  function openPopover() {
    updateStats();
    pop.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    setTimeout(function() {
      document.addEventListener('click', onDocClick);
    }, 0);
  }

  function closePopover() {
    pop.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    document.removeEventListener('click', onDocClick);
  }

  function onDocClick(e) {
    if (!pop.contains(e.target) && !btn.contains(e.target)) closePopover();
  }

  btn.addEventListener('click', function(e) {
    e.stopPropagation();
    pop.hidden ? openPopover() : closePopover();
  });

  pop.addEventListener('click', function(e) {
    if (e.target.closest('[data-close]')) closePopover();
    var act = e.target.closest('[data-sheet]');
    if (act) {
      closePopover();
      openSheet(act.getAttribute('data-sheet'));
    }
  });

  var todayCareBtn = $('#brTodayCareBtn');
  if (todayCareBtn) {
    todayCareBtn.addEventListener('click', function() {
      closePopover();
      if (window.plantApp && window.plantApp.showTodaysCareList) {
        window.plantApp.showTodaysCareList();
      }
    });
  }

  function openSheet(type) {
    console.log('openSheet called with type:', type);
    updateStats();
    if (!sheet) {
      console.log('sheet element not found');
      return;
    }

    var titleEl = $('#brSheetTitle');
    var bodyEl = $('#brSheetBody');
    if (!titleEl || !bodyEl) {
      console.log('titleEl or bodyEl not found');
      return;
    }

    var titleMap = {
      care: 'ケア詳細',
      consult: '相談の詳細',
      illustration: 'イラスト利用状況',
      membership: '会員プラン'
    };

    // ★★★ 戻るボタンを含むHTMLを生成 ★★★
    var backButtonHtml = '<button class="br-sheet-back" style="background:none;border:none;color:#3b82f6;font-size:14px;font-weight:600;cursor:pointer;padding:8px 12px;margin-right:12px;border-radius:6px;" onclick="(function(){document.getElementById(\'brSheet\').setAttribute(\'aria-hidden\',\'true\');document.getElementById(\'brUserPopover\').hidden=false;document.getElementById(\'brUserBtn\').setAttribute(\'aria-expanded\',\'true\');})()">← メニュー</button>';
    
    titleEl.innerHTML = backButtonHtml + '<span>' + (titleMap[type] || '詳細') + '</span>';
    
    console.log('titleEl.innerHTML after update:', titleEl.innerHTML);

    bodyEl.innerHTML = '<div class="loading">読み込み中...</div>';
    sheet.setAttribute('aria-hidden', 'false');

    var fallbackContent = {
      care: '<div class="list"><div class="list-item">ケア詳細画面</div></div>',
      consult: '<div class="list"><div class="list-item">相談詳細画面</div></div>',
      illustration: '<div class="list"><div class="list-item">イラスト詳細画面</div></div>',
      membership: '<div class="list"><div class="list-item">会員プラン画面</div></div>'
    };

    var apiBase = window.plantApp && window.plantApp.apiBase;
    if (!apiBase) {
      console.log('apiBase not found, using fallback');
      bodyEl.innerHTML = fallbackContent[type] || '<p>データがありません</p>';
      return;
    }

    fetch(apiBase + '?action=header_stat_list', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        user_email: window.plantApp ? window.plantApp.userEmail : null,
        entitlement: window.plantApp ? window.plantApp.entitlement : null,
        entitlement_snapshot: window.plantApp ? window.plantApp.entitlementSnapshot : null,
        list_type: type
      })
    })
    .then(function(res) {
      if (!res.ok) {
        throw new Error('HTTP ' + res.status + ': ' + res.statusText);
      }
      return res.json();
    })
    .then(function(data) {
      var items = Array.isArray(data.items) ? data.items : [];

      if (!items.length) {
        bodyEl.innerHTML = fallbackContent[type] || '<p>データがありません</p>';
        return;
      }

      var escapeHtml = window.plantApp && window.plantApp.escapeHtml ? 
        window.plantApp.escapeHtml.bind(window.plantApp) : 
        function(text) { return String(text); };

      bodyEl.innerHTML = '<div class="list">' + 
        items.map(function(item) {
          var label = escapeHtml(item.label || '');
          var value = escapeHtml(String(item.value != null ? item.value : '—'));
          return '<div class="list-item"><strong>' + label + '</strong><br><span>' + value + '</span></div>';
        }).join('') + 
        '</div>';
    })
    .catch(function(e) {
      console.error('header_stat_list error', e);

      var escapeHtml = window.plantApp && window.plantApp.escapeHtml ? 
        window.plantApp.escapeHtml.bind(window.plantApp) : 
        function(text) { return String(text); };

      bodyEl.innerHTML = 
        '<div class="error-message">' +
        '<h5>詳細データの取得に失敗しました</h5>' +
        '<p>一時的な通信エラーの可能性があります。</p>' +
        '<p><small>' + escapeHtml(e.message) + '</small></p>' +
        '<div class="error-actions">' +
        '<button class="btn btn-small btn-secondary" onclick="document.getElementById(\'brSheet\').setAttribute(\'aria-hidden\',\'true\')">閉じる</button>' +
        '</div>' +
        '</div>';

      if (window.plantApp && window.plantApp.showTemporaryNotification) {
        window.plantApp.showTemporaryNotification('詳細の取得に失敗しました', 'error');
      }
    });
  }

  function closeSheet() {
    sheet.setAttribute('aria-hidden', 'true');
  }

  sheet.addEventListener('click', function(e) {
    if (e.target.matches('[data-sheet-close]') || e.target.matches('.br-sheet-backdrop')) {
      closeSheet();
    }
  });

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      closePopover();
      closeSheet();
    }
  });

  if (window.plantApp) {
    var originalLoadHeaderStats = window.plantApp.loadHeaderStats;
    if (originalLoadHeaderStats) {
      window.plantApp.loadHeaderStats = function() {
        originalLoadHeaderStats.call(this);
        setTimeout(updateStats, 100);
      };
    }
  }
  
  console.log('新ヘッダー制御JS初期化完了');
})();
// END OF COMPLETE INTEGRATED JAVASCRIPT
// LEAFLA植物育成記録システム v17.1.0完全統合版
// 全機能実装完了・nano-banana統合・構文エラー修正済み



