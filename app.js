// ReviewFlow AI — Business logic
// AI review response generator + sentiment analyzer for single-location SMBs

const STORAGE_KEY = 'reviewflow_history';
const USAGE_KEY = 'reviewflow_usage';
const FREE_LIMIT = 3;

// --- Stripe Configuration ---
// Replace with live Stripe Payment Links when Stripe account is set up
const STRIPE_LINKS = {
    pro: 'https://buy.stripe.com/test_pro_placeholder',
    business: 'https://buy.stripe.com/test_business_placeholder'
};

function startCheckout(plan) {
    const url = STRIPE_LINKS[plan];
    if (url.includes('placeholder')) {
        showToast('Payments coming soon! Join the waitlist.');
        trackWaitlist(plan);
        return;
    }
    window.open(url, '_blank');
}

function trackWaitlist(plan) {
    const waitlist = JSON.parse(localStorage.getItem('reviewflow_waitlist') || '[]');
    waitlist.push({ plan, timestamp: new Date().toISOString() });
    localStorage.setItem('reviewflow_waitlist', JSON.stringify(waitlist));
}

// --- Usage Tracking (Free Tier Limit) ---
function getUsage() {
    const data = JSON.parse(localStorage.getItem(USAGE_KEY) || '{}');
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${now.getMonth()}`;
    if (data.month !== monthKey) {
        return { month: monthKey, count: 0 };
    }
    return data;
}

function incrementUsage() {
    const usage = getUsage();
    usage.count++;
    localStorage.setItem(USAGE_KEY, JSON.stringify(usage));
    return usage.count;
}

function canGenerate() {
    const usage = getUsage();
    return usage.count < FREE_LIMIT;
}

// --- Tab Navigation ---
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(tab.dataset.tab).classList.add('active');
        if (tab.dataset.tab === 'dashboard') updateDashboard();
        if (tab.dataset.tab === 'history') renderHistory();
    });
});

// --- Sentiment Analysis ---
function analyzeSentiment(text, rating) {
    const positiveWords = ['great','excellent','amazing','wonderful','fantastic','love','best','perfect',
        'delicious','friendly','clean','fast','helpful','recommend','awesome','outstanding','professional',
        'comfortable','fresh','quality','attentive','welcoming','pleasant','satisfied','impressed'];
    const negativeWords = ['terrible','awful','worst','horrible','disgusting','rude','slow','dirty',
        'cold','stale','overpriced','disappointing','never','waste','poor','bad','unprofessional',
        'uncomfortable','bland','mediocre','ignored','unfriendly','complaint','unacceptable','broken'];

    const lower = text.toLowerCase();
    const words = lower.split(/\s+/);
    let posCount = 0, negCount = 0;

    words.forEach(w => {
        const clean = w.replace(/[^a-z]/g, '');
        if (positiveWords.includes(clean)) posCount++;
        if (negativeWords.includes(clean)) negCount++;
    });

    // Weight by star rating
    const ratingWeight = (rating - 3) * 0.15;
    const total = Math.max(posCount + negCount, 1);
    let score = ((posCount - negCount) / total) * 0.5 + 0.5 + ratingWeight;
    score = Math.max(0, Math.min(1, score));

    let label, cssClass;
    if (score >= 0.6) { label = 'Positive'; cssClass = 'sentiment-positive'; }
    else if (score >= 0.4) { label = 'Mixed'; cssClass = 'sentiment-mixed'; }
    else { label = 'Negative'; cssClass = 'sentiment-negative'; }

    // Extract top keywords
    const allWords = words.map(w => w.replace(/[^a-z]/g, '')).filter(w => w.length > 3);
    const freq = {};
    allWords.forEach(w => { freq[w] = (freq[w] || 0) + 1; });
    const keywords = Object.entries(freq)
        .filter(([w]) => !['this','that','with','from','have','been','were','they','their','what','about','would','there','some','them','than','very','just','also','more'].includes(w))
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([w]) => w);

    return { score, label, cssClass, keywords, posCount, negCount };
}

// --- Response Generation ---
function generateResponse() {
    const reviewText = document.getElementById('reviewText').value.trim();
    if (!reviewText) { showToast('Please paste a review first'); return; }

    if (!canGenerate()) {
        showToast(`Free limit reached (${FREE_LIMIT}/mo). Upgrade to Pro for unlimited.`);
        document.querySelector('[data-tab="pricing"]').click();
        return;
    }

    const btn = document.getElementById('generateBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Generating...';

    const businessName = document.getElementById('businessName').value || 'our business';
    const businessType = document.getElementById('businessType').value;
    const rating = parseInt(document.getElementById('reviewRating').value);
    const tone = document.getElementById('tone').value;
    const source = document.getElementById('reviewSource').value;

    const sentiment = analyzeSentiment(reviewText, rating);

    // Simulate AI processing delay
    setTimeout(() => {
        const response = buildResponse(reviewText, businessName, businessType, rating, tone, sentiment);

        const used = incrementUsage();
        document.getElementById('responseText').textContent = response;
        document.getElementById('sentimentBadge').innerHTML =
            `<span class="sentiment-score ${sentiment.cssClass}">Sentiment: ${sentiment.label} (${Math.round(sentiment.score * 100)}%)</span>`;
        document.getElementById('responseOutput').style.display = 'block';
        document.getElementById('responseOutput').scrollIntoView({ behavior: 'smooth' });

        // Store current response for saving
        window._currentResponse = {
            reviewText, response, rating, source, sentiment,
            businessName, businessType, tone, timestamp: new Date().toISOString()
        };

        btn.disabled = false;
        btn.innerHTML = 'Generate AI Response';
        updateUsageCounter();
    }, 800 + Math.random() * 600);
}

function buildResponse(review, business, businessType, rating, tone, sentiment) {
    const greetings = {
        professional: 'Thank you for taking the time to share your feedback.',
        friendly: 'Hi there! Thanks so much for your review!',
        apologetic: 'Thank you for bringing this to our attention. We sincerely apologize for your experience.',
        grateful: 'Wow, thank you so much for this wonderful review!'
    };

    const closings = {
        professional: `We appreciate your business and look forward to serving you again.\n\nBest regards,\nThe ${business} Team`,
        friendly: `Can't wait to see you again! Thanks for being awesome.\n\nCheers,\n${business}`,
        apologetic: `We hope you'll give us another chance to make things right. Please reach out to us directly so we can resolve this.\n\nSincerely,\nThe ${business} Team`,
        grateful: `You've made our day! We're so grateful for customers like you.\n\nWith appreciation,\n${business}`
    };

    const typeContext = {
        restaurant: { noun: 'dining experience', action: 'meal', place: 'restaurant' },
        salon: { noun: 'visit', action: 'appointment', place: 'salon' },
        clinic: { noun: 'visit', action: 'appointment', place: 'clinic' },
        trades: { noun: 'service experience', action: 'job', place: 'business' },
        retail: { noun: 'shopping experience', action: 'visit', place: 'store' },
        fitness: { noun: 'workout experience', action: 'session', place: 'gym' },
        other: { noun: 'experience', action: 'visit', place: 'business' }
    };

    const ctx = typeContext[businessType] || typeContext.other;
    const keywords = sentiment.keywords.slice(0, 3);
    let middle = '';

    if (rating >= 4) {
        middle = `We're thrilled to hear you had a great ${ctx.noun}`;
        if (keywords.length > 0) {
            middle += `. We're especially glad you noticed our ${keywords.join(' and ')}`;
        }
        middle += `. Our team works hard every day to make every ${ctx.action} special, and reviews like yours make it all worth it.`;
    } else if (rating === 3) {
        middle = `We appreciate your honest feedback about your ${ctx.noun}`;
        if (keywords.length > 0) {
            middle += `. We've noted your comments about ${keywords.join(', ')}`;
        }
        middle += `. We're always looking to improve and your input helps us do just that. We'd love the chance to exceed your expectations on your next ${ctx.action}.`;
    } else {
        middle = `We're truly sorry that your ${ctx.noun} didn't meet your expectations`;
        if (keywords.length > 0) {
            middle += `. Your concerns about ${keywords.join(' and ')} are being taken very seriously by our team`;
        }
        middle += `. This is not the standard we hold ourselves to at ${business}. We're taking immediate steps to address the issues you've raised.`;
    }

    return `${greetings[tone]}\n\n${middle}\n\n${closings[tone]}`;
}

function regenerate() {
    generateResponse();
}

function copyResponse() {
    const text = document.getElementById('responseText').textContent;
    navigator.clipboard.writeText(text).then(() => showToast('Response copied to clipboard!'));
}

// --- History Management ---
function getHistory() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch { return []; }
}

function saveToHistory() {
    if (!window._currentResponse) return;
    const history = getHistory();
    history.unshift(window._currentResponse);
    if (history.length > 50) history.pop(); // Keep last 50
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    showToast('Response saved to history!');
}

function renderHistory() {
    const history = getHistory();
    const container = document.getElementById('historyList');
    if (history.length === 0) {
        container.innerHTML = '<p style="color:var(--text-light); text-align:center; padding:2rem;">No responses saved yet.</p>';
        return;
    }
    container.innerHTML = history.map((item, i) => {
        const stars = '\u2605'.repeat(item.rating) + '\u2606'.repeat(5 - item.rating);
        const date = new Date(item.timestamp).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
        return `
        <div class="review-item">
            <div class="review-meta">
                <span class="review-stars">${stars}</span>
                <span class="review-source">${item.source} &middot; ${date}</span>
            </div>
            <div class="review-text">${escapeHtml(item.reviewText.substring(0, 150))}${item.reviewText.length > 150 ? '...' : ''}</div>
            <div class="review-response">
                <div class="review-response-label">AI Response</div>
                ${escapeHtml(item.response.substring(0, 200))}${item.response.length > 200 ? '...' : ''}
            </div>
        </div>`;
    }).join('');
}

function clearHistory() {
    if (confirm('Clear all saved responses?')) {
        localStorage.removeItem(STORAGE_KEY);
        renderHistory();
        updateDashboard();
        showToast('History cleared');
    }
}

// --- Dashboard ---
function updateDashboard() {
    const history = getHistory();
    const total = history.length;

    document.getElementById('totalReviews').textContent = total;

    if (total === 0) {
        document.getElementById('avgRating').textContent = '0.0';
        document.getElementById('responseRate').textContent = '0%';
        document.getElementById('sentimentAvg').textContent = '--';
        return;
    }

    const avgRating = (history.reduce((sum, h) => sum + h.rating, 0) / total).toFixed(1);
    document.getElementById('avgRating').textContent = avgRating;
    document.getElementById('responseRate').textContent = '100%';

    // Sentiment breakdown
    let pos = 0, neu = 0, neg = 0;
    const allKeywords = {};
    history.forEach(h => {
        if (h.sentiment) {
            if (h.sentiment.score >= 0.6) pos++;
            else if (h.sentiment.score >= 0.4) neu++;
            else neg++;
            (h.sentiment.keywords || []).forEach(k => { allKeywords[k] = (allKeywords[k] || 0) + 1; });
        }
    });

    const posP = Math.round(pos / total * 100);
    const neuP = Math.round(neu / total * 100);
    const negP = 100 - posP - neuP;

    document.getElementById('sentimentAvg').textContent = posP >= 60 ? 'Good' : posP >= 40 ? 'Mixed' : 'Low';

    const bar = document.getElementById('sentimentBar');
    bar.innerHTML = `
        <div class="sentiment-pos" style="width:${posP}%"></div>
        <div class="sentiment-neu" style="width:${neuP}%"></div>
        <div class="sentiment-neg" style="width:${negP}%"></div>`;
    document.getElementById('posLabel').textContent = `Positive: ${posP}%`;
    document.getElementById('neuLabel').textContent = `Neutral: ${neuP}%`;
    document.getElementById('negLabel').textContent = `Negative: ${negP}%`;

    // Keywords
    const topKeywords = Object.entries(allKeywords).sort((a, b) => b[1] - a[1]).slice(0, 12);
    const kwContainer = document.getElementById('keywords');
    if (topKeywords.length > 0) {
        kwContainer.innerHTML = topKeywords.map(([w, c]) =>
            `<span style="background:#f1f5f9; padding:0.3rem 0.7rem; border-radius:20px; font-size:0.85rem;">${w} (${c})</span>`
        ).join('');
    }
}

// --- Utilities ---
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
}

// --- Usage Counter Display ---
function updateUsageCounter() {
    const usage = getUsage();
    const el = document.getElementById('usageCounter');
    if (el) {
        const remaining = Math.max(0, FREE_LIMIT - usage.count);
        el.textContent = `${remaining}/${FREE_LIMIT} free responses left this month`;
        if (remaining === 0) el.style.color = 'var(--danger)';
    }
}

// Init
updateUsageCounter();
console.log('ReviewFlow AI loaded');
