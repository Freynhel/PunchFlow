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
let rafId = null;
let beatId = null;
let startTime = null;
let intervalMs = 5000;
let wakeLock = null;
let currentCombo = [];
let beatIndex = 0;

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

function isMuted() {
	return localStorage.getItem(MUTE_KEY) === '1';
}

function setMuted(val) {
	localStorage.setItem(MUTE_KEY, val ? '1' : '0');
	renderMuteBtn();
}

function renderMuteBtn() {
	const muted = isMuted();
	muteBtn.setAttribute('aria-pressed', String(muted));
	muteBtn.textContent = muted ? 'Sound Off' : 'Sound On';
	muteBtn.classList.toggle('muted', muted);
}

muteBtn.addEventListener('click', () => {
	if (!isMuted()) {
		/* resume ctx so next unmute works on mobile */
		try { getAudioCtx(); } catch (_) { }
	}
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

/* ── Render combo with per-punch spans ── */
function renderComboSpans(combo, activeIdx) {
	comboDisplay.innerHTML = combo.map((n, i) => {
		const cls = i === activeIdx ? ' class="punch-active"' : '';
		const sep = i < combo.length - 1
			? '<span class="separator">–</span>'
			: '';
		return `<span${cls}>${n}</span>${sep}`;
	}).join('');
}

function fadeToCombo(combo) {
	comboDisplay.classList.add('fade');
	setTimeout(() => {
		beatIndex = 0;
		currentCombo = combo;
		renderComboSpans(combo, beatIndex);
		comboDisplay.classList.remove('fade');
	}, 120);
}

/* ── Metronome beat ── */
function startBeat() {
	clearInterval(beatId);
	const len = currentCombo.length;
	if (len === 0) return;
	const beatMs = intervalMs / len;

	beatId = setInterval(() => {
		if (!running) return;
		beatIndex = (beatIndex + 1) % len;
		const isFirst = beatIndex === 0;
		renderComboSpans(currentCombo, beatIndex);
		playClick(isFirst);
	}, beatMs);
}

/* ── Progress ring animation ── */
function animateRing() {
	cancelAnimationFrame(rafId);
	function frame() {
		const elapsed = performance.now() - startTime;
		const progress = Math.min(elapsed / intervalMs, 1);
		const offset = CIRCUMFERENCE * (1 - progress);
		progressRing.style.strokeDashoffset = offset;
		const remaining = Math.ceil((intervalMs - elapsed) / 1000);
		progressCount.textContent = remaining + 's';
		if (progress < 1) rafId = requestAnimationFrame(frame);
	}
	rafId = requestAnimationFrame(frame);
}

function tick(combo) {
	startTime = performance.now();
	intervalMs = getInterval() * 1000;
	currentCombo = combo;
	beatIndex = 0;
	comboDisplay.classList.add('fade');
	setTimeout(() => {
		renderComboSpans(combo, beatIndex);
		comboDisplay.classList.remove('fade');
		playClick(true);
		startBeat();
	}, 120);
	progressCount.textContent = getInterval() + 's';
	animateRing();
}

function scheduleNext() {
	clearTimeout(timerId);
	timerId = setTimeout(() => {
		if (!running) return;
		tick(generateCombo(getLength()));
		scheduleNext();
	}, intervalMs);
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
	intervalMs = getInterval() * 1000;
	/* resume AudioContext after user gesture */
	try { getAudioCtx().resume(); } catch (_) { }
	tick(generateCombo(getLength()));
	scheduleNext();
}

function stopTraining() {
	running = false;
	clearTimeout(timerId);
	clearInterval(beatId);
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
	clearTimeout(timerId);
	clearInterval(beatId);
	cancelAnimationFrame(rafId);
	tick(generateCombo(getLength()));
	scheduleNext();
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