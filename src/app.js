
const CIRCUMFERENCE = 2 * Math.PI * 24;

const comboDisplay = document.getElementById('comboDisplay');
const progressRing = document.getElementById('progressRing');
const progressCount = document.getElementById('progressCount');
const dot = document.getElementById('dot');
const statusText = document.getElementById('statusText');
const startBtn = document.getElementById('startBtn');
const skipBtn = document.getElementById('skipBtn');
const lengthSlider = document.getElementById('lengthSlider');
const intervalSlider = document.getElementById('intervalSlider');
const lengthVal = document.getElementById('lengthVal');
const intervalVal = document.getElementById('intervalVal');
const legendBtn = document.getElementById('legendBtn');
const modalBackdrop = document.getElementById('modalBackdrop');
const modalClose = document.getElementById('modalClose');

let running = false;
let timerId = null;
let rafId = null;
let startTime = null;
let intervalMs = 5000;

function getLength() { return parseInt(lengthSlider.value); }
function getInterval() { return parseInt(intervalSlider.value); }

lengthSlider.addEventListener('input', () => { lengthVal.textContent = lengthSlider.value; });
intervalSlider.addEventListener('input', () => {
	intervalVal.textContent = intervalSlider.value;
	intervalMs = getInterval() * 1000;
});

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

function renderCombo(combo) {
	comboDisplay.innerHTML = combo.map((n, i) =>
		n + (i < combo.length - 1 ? '<span class="separator">–</span>' : '')
	).join('');
}

function fadeToCombo(combo) {
	comboDisplay.classList.add('fade');
	setTimeout(() => {
		renderCombo(combo);
		comboDisplay.classList.remove('fade');
	}, 120);
}

function tick(combo) {
	startTime = performance.now();
	intervalMs = getInterval() * 1000;
	fadeToCombo(combo);
	progressCount.textContent = getInterval() + 's';
	animateRing();
}

function animateRing() {
	cancelAnimationFrame(rafId);
	function frame() {
		const elapsed = performance.now() - startTime;
		const progress = Math.min(elapsed / intervalMs, 1);
		const offset = CIRCUMFERENCE * (1 - progress);
		progressRing.style.strokeDashoffset = offset;
		const remaining = Math.ceil((intervalMs - elapsed) / 1000);
		progressCount.textContent = remaining + 's';
		if (progress < 1) {
			rafId = requestAnimationFrame(frame);
		}
	}
	rafId = requestAnimationFrame(frame);
}

function scheduleNext() {
	clearTimeout(timerId);
	timerId = setTimeout(() => {
		if (!running) return;
		tick(generateCombo(getLength()));
		scheduleNext();
	}, intervalMs);
}

function startTraining() {
	if (running) return;
	running = true;
	dot.classList.add('active');
	statusText.textContent = 'Training';
	startBtn.textContent = 'Running…';
	startBtn.disabled = true;
	intervalMs = getInterval() * 1000;
	tick(generateCombo(getLength()));
	scheduleNext();
}

function stopTraining() {
	running = false;
	clearTimeout(timerId);
	cancelAnimationFrame(rafId);
	dot.classList.remove('active');
	statusText.textContent = 'Stopped';
	startBtn.textContent = 'Start';
	startBtn.disabled = false;
	progressRing.style.strokeDashoffset = CIRCUMFERENCE;
	progressCount.textContent = '—';
	comboDisplay.innerHTML = '— — —';
}

startBtn.addEventListener('click', () => {
	if (!running) startTraining();
	else stopTraining();
});

skipBtn.addEventListener('click', () => {
	if (!running) return;
	clearTimeout(timerId);
	cancelAnimationFrame(rafId);
	tick(generateCombo(getLength()));
	scheduleNext();
});

startBtn.addEventListener('click', () => {
	if (startBtn.textContent === 'Start') return;
});

document.addEventListener('keydown', e => {
	if (e.code === 'Space') { e.preventDefault(); running ? stopTraining() : startTraining(); }
	if (e.code === 'ArrowRight' && running) skipBtn.click();
});

legendBtn.addEventListener('click', () => modalBackdrop.classList.add('open'));
modalClose.addEventListener('click', () => modalBackdrop.classList.remove('open'));
modalBackdrop.addEventListener('click', e => { if (e.target === modalBackdrop) modalBackdrop.classList.remove('open'); });

startBtn.addEventListener('click', function () {
	if (!running && startBtn.textContent !== 'Running…') startTraining();
	else if (running) stopTraining();
});

startBtn.removeEventListener('click', startTraining);
startBtn.onclick = () => running ? stopTraining() : startTraining();

if ('wakeLock' in navigator) {
	let wakeLock = null;
	startBtn.addEventListener('click', async () => {
		if (running) {
			try { wakeLock = await navigator.wakeLock.request('screen'); } catch (_) { }
		} else {
			if (wakeLock) { wakeLock.release(); wakeLock = null; }
		}
	});
}