const CIRCUMFERENCE = 2 * Math.PI * 24;

const comboDisplay = document.getElementById('comboDisplay');
const progressRing = document.getElementById('progressRing');
const progressCount = document.getElementById('progressCount');
const dot = document.getElementById('dot');
const statusText = document.getElementById('statusText');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const skipBtn = document.getElementById('skipBtn');
const lengthSlider = document.getElementById('lengthSlider');
const intervalSlider = document.getElementById('intervalSlider');
const lengthVal = document.getElementById('lengthVal');
const intervalVal = document.getElementById('intervalVal');
const legendBtn = document.getElementById('legendBtn');
const modalBackdrop = document.getElementById('modalBackdrop');
const modalClose = document.getElementById('modalClose');
const muteBtn = document.getElementById('muteBtn');

let running = false;
let timerId = null;
let beatId = null;
let rafId = null;
let startTime = null;
let intervalMs = 5000;
let wakeLock = null;
let currentCombo = [];
let beatIndex = 0;
let tickGen = 0;

/* ── Audio ── */
let audioCtx = null;

function getAudioCtx() {
	if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
	return audioCtx;
}

function playClick(accent = false) {
	if (isMuted()) return;
	try {
		const ctx = getAudioCtx();
		const osc = ctx.createOscillator();
		const gain = ctx.createGain();
		osc.connect(gain);
		gain.connect(ctx.destination);
		osc.type = 'sine';
		osc.frequency.value = accent ? 1200 : 900;
		gain.gain.setValueAtTime(accent ? 0.35 : 0.22, ctx.currentTime);
		gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.045);
		osc.start(ctx.currentTime);
		osc.stop(ctx.currentTime + 0.05);
	} catch (_) { }
}

/* ── Mute ── */
const MUTE_KEY = 'punchflow_mute';

function isMuted() { return localStorage.getItem(MUTE_KEY) === '1'; }
function setMuted(val) { localStorage.setItem(MUTE_KEY, val ? '1' : '0'); renderMuteBtn(); }

function renderMuteBtn() {
	const muted = isMuted();
	muteBtn.setAttribute('aria-pressed', String(muted));
	muteBtn.textContent = muted ? 'Sound Off' : 'Sound On';
	muteBtn.classList.toggle('muted', muted);
}

muteBtn.addEventListener('click', () => {
	try { getAudioCtx().resume(); } catch (_) { }
	setMuted(!isMuted());
});

/* ── Sliders ── */
function getLength() { return parseInt(lengthSlider.value); }
function getInterval() { return parseInt(intervalSlider.value); }

lengthSlider.addEventListener('input', () => { lengthVal.textContent = lengthSlider.value; });
intervalSlider.addEventListener('input', () => {
	intervalVal.textContent = intervalSlider.value;
	intervalMs = getInterval() * 1000;
});

/* ── Combo generation ── */
function generateCombo(len) {
	const punches = [];
	const all = [1, 2, 3, 4, 5, 6, 7, 8];
	for (let i = 0; i < len; i++) {
		let pick;
		do { pick = all[Math.floor(Math.random() * all.length)]; }
		while (punches.length && pick === punches[punches.length - 1]);
		punches.push(pick);
	}
	return punches;
}

/* ── Render ── */
function renderComboSpans(combo, activeIdx) {
	comboDisplay.innerHTML = combo.map((n, i) => {
		const cls = i === activeIdx ? ' class="punch-active"' : '';
		const sep = i < combo.length - 1 ? '<span class="separator">–</span>' : '';
		return `<span${cls}>${n}</span>${sep}`;
	}).join('');
}

/* ── Progress ring (anchored to startTime) ── */
function animateRing() {
	cancelAnimationFrame(rafId);
	function frame() {
		const elapsed = performance.now() - startTime;
		const progress = Math.min(elapsed / intervalMs, 1);
		progressRing.style.strokeDashoffset = CIRCUMFERENCE * (1 - progress);
		progressCount.textContent = Math.ceil((intervalMs - elapsed) / 1000) + 's';
		if (progress < 1) rafId = requestAnimationFrame(frame);
	}
	rafId = requestAnimationFrame(frame);
}

/* ── Drift-correcting beat scheduler ──────────────────────────────────────
 *
 *  Each beat fires at an absolute time:
 *    fireAt = startTime + beatNum * beatMs
 *
 *  Instead of a fixed setInterval (which accumulates jitter), each callback
 *  schedules the NEXT beat based on how far we already are past startTime.
 *  This keeps beats and the ring in phase indefinitely.
 */
function scheduleBeat(gen, combo, beatNum) {
	const beatMs = intervalMs / combo.length;
	const fireAt = startTime + beatNum * beatMs;
	const delay = Math.max(0, fireAt - performance.now());

	beatId = setTimeout(() => {
		if (!running || gen !== tickGen) return;
		const idx = beatNum % combo.length;
		beatIndex = idx;
		renderComboSpans(combo, idx);
		playClick(idx === 0);
		scheduleBeat(gen, combo, beatNum + 1);
	}, delay);
}

/* ── Sequence scheduler (anchored to the same startTime) ── */
function scheduleNext(gen) {
	const fireAt = startTime + intervalMs;
	const delay = Math.max(0, fireAt - performance.now());

	timerId = setTimeout(() => {
		if (!running || gen !== tickGen) return;
		tick(generateCombo(getLength()));
	}, delay);
}

/* ── tick ──────────────────────────────────────────────────────────────────
 *
 *  Fade OUT → capture startTime → render → kick off ring + beats + sequence.
 *  All three share one startTime so they are perfectly phase-locked from the
 *  moment the combo becomes visible.
 */
function tick(combo) {
	intervalMs = getInterval() * 1000;
	const gen = ++tickGen;

	clearTimeout(timerId);
	clearTimeout(beatId);
	cancelAnimationFrame(rafId);

	comboDisplay.classList.add('fade');

	setTimeout(() => {
		if (!running || gen !== tickGen) return;

		startTime = performance.now();   // single anchor for everything
		currentCombo = combo;
		beatIndex = 0;

		renderComboSpans(combo, 0);
		comboDisplay.classList.remove('fade');

		animateRing();
		playClick(true);
		scheduleBeat(gen, combo, 1);        // beat 0 already shown; schedule 1 onward
		scheduleNext(gen);
	}, 120);
}

/* ── Control state ── */
function syncControlState() {
	startBtn.disabled = running;
	stopBtn.disabled = !running;
	skipBtn.disabled = !running;
}

/* ── Wake lock ── */
async function acquireWakeLock() {
	if (!('wakeLock' in navigator) || wakeLock) return;
	try {
		wakeLock = await navigator.wakeLock.request('screen');
		wakeLock.addEventListener('release', () => { wakeLock = null; });
	} catch (_) { }
}
async function releaseWakeLock() {
	if (!wakeLock) return;
	try { await wakeLock.release(); } catch (_) { }
	wakeLock = null;
}

/* ── Start / Stop ── */
function startTraining() {
	if (running) return;
	running = true;
	dot.classList.add('active');
	statusText.textContent = 'Training';
	syncControlState();
	acquireWakeLock();
	try { getAudioCtx().resume(); } catch (_) { }
	tick(generateCombo(getLength()));
}

function stopTraining() {
	running = false;
	tickGen++;
	clearTimeout(timerId);
	clearTimeout(beatId);
	cancelAnimationFrame(rafId);
	currentCombo = [];
	beatIndex = 0;
	dot.classList.remove('active');
	statusText.textContent = 'Stopped';
	syncControlState();
	releaseWakeLock();
	progressRing.style.strokeDashoffset = CIRCUMFERENCE;
	progressCount.textContent = '—';
	comboDisplay.innerHTML = '— — —';
}

startBtn.addEventListener('click', startTraining);
stopBtn.addEventListener('click', stopTraining);

skipBtn.addEventListener('click', () => {
	if (!running) return;
	tick(generateCombo(getLength()));
});

document.addEventListener('keydown', e => {
	if (e.code === 'Space') { e.preventDefault(); running ? stopTraining() : startTraining(); }
	if (e.code === 'ArrowRight' && running) skipBtn.click();
	if (e.code === 'KeyM') { setMuted(!isMuted()); }
});

legendBtn.addEventListener('click', () => modalBackdrop.classList.add('open'));
modalClose.addEventListener('click', () => modalBackdrop.classList.remove('open'));
modalBackdrop.addEventListener('click', e => {
	if (e.target === modalBackdrop) modalBackdrop.classList.remove('open');
});

document.addEventListener('visibilitychange', () => {
	if (document.visibilityState === 'visible' && running) acquireWakeLock();
});

renderMuteBtn();
syncControlState();