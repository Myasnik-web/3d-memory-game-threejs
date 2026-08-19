// --- AUDIO SYNTHESIZER ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const freqs = [261.63, 329.63, 392.00, 523.25]; // C4, E4, G4, C5

function playSound(index, isError = false) {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  
  osc.type = isError ? 'sawtooth' : 'sine';
  osc.frequency.value = isError ? 90 : freqs[index];
  
  gain.gain.setValueAtTime(0.25, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + (isError ? 0.7 : 0.35));
  
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + (isError ? 0.7 : 0.35));
}

// --- THREE.JS 3D WORLD SETUP ---
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x030308, 0.04);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 1, 8);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
container.appendChild(renderer.domElement);

// Lighting
const ambLight = new THREE.AmbientLight(0xffffff, 0.3);
scene.add(ambLight);

const pointLight = new THREE.PointLight(0x00f3ff, 2, 25);
pointLight.position.set(0, 2, 5);
scene.add(pointLight);

// 3D Tron Grid Floor
const gridHelper = new THREE.GridHelper(60, 40, 0x00f3ff, 0x111528);
gridHelper.position.y = -3.5;
scene.add(gridHelper);

// Core Colors & Objects Setup
const coreColors = [0x00f3ff, 0xff0055, 0xffcc00, 0x9d00ff];
const cores = [];
const coreGroup = new THREE.Group();

const positions = [
  [-1.6, 1.4, 0],  // Top Left
  [1.6, 1.4, 0],   // Top Right
  [-1.6, -1.2, 0], // Bottom Left
  [1.6, -1.2, 0]   // Bottom Right
];

positions.forEach((pos, i) => {
  const group = new THREE.Group();
  
  // Outer Wireframe Icosahedron
  const outerGeo = new THREE.IcosahedronGeometry(1.1, 1);
  const outerMat = new THREE.MeshBasicMaterial({
    color: coreColors[i],
    wireframe: true,
    transparent: true,
    opacity: 0.4
  });
  const outerMesh = new THREE.Mesh(outerGeo, outerMat);

  // Inner Metallic Core
  const innerGeo = new THREE.IcosahedronGeometry(0.7, 0);
  const innerMat = new THREE.MeshStandardMaterial({
    color: coreColors[i],
    roughness: 0.1,
    metalness: 0.9,
    emissive: 0x000000
  });
  const innerMesh = new THREE.Mesh(innerGeo, innerMat);

  group.add(outerMesh);
  group.add(innerMesh);
  group.position.set(...pos);
  group.userData = { id: i, baseColor: coreColors[i], outer: outerMesh, inner: innerMesh };

  cores.push(group);
  coreGroup.add(group);
});

scene.add(coreGroup);

// --- PARTICLE EXPLOSION SYSTEM ---
const particlePool = [];
function triggerExplosion(x, y, z, colorHex) {
  const count = 25;
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const velocities = [];

  for (let i = 0; i < count; i++) {
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;

    velocities.push(
      (Math.random() - 0.5) * 0.2,
      (Math.random() - 0.5) * 0.2,
      (Math.random() - 0.5) * 0.2
    );
  }

  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({ size: 0.08, color: colorHex, transparent: true, opacity: 1 });
  const pSystem = new THREE.Points(geo, mat);
  scene.add(pSystem);

  particlePool.push({ system: pSystem, velocities: velocities, life: 1.0 });
}

function updateParticles() {
  for (let i = particlePool.length - 1; i >= 0; i--) {
    const p = particlePool[i];
    p.life -= 0.03;
    p.system.material.opacity = p.life;

    const pos = p.system.geometry.attributes.position.array;
    for (let j = 0; j < p.velocities.length / 3; j++) {
      pos[j * 3] += p.velocities[j * 3];
      pos[j * 3 + 1] += p.velocities[j * 3 + 1];
      pos[j * 3 + 2] += p.velocities[j * 3 + 2];
    }
    p.system.geometry.attributes.position.needsUpdate = true;

    if (p.life <= 0) {
      scene.remove(p.system);
      particlePool.splice(i, 1);
    }
  }
}

// --- GAME LOGIC & MODES ---
let sequence = [];
let playerSequence = [];
let level = 0;
let combo = 1;
let highScore = localStorage.getItem('omegaCoreHighScore') || 0;
let canClick = false;
let isPlaying = false;
let currentMode = 'normal'; // normal, reverse, hyper

const levelVal = document.getElementById('level-val');
const comboVal = document.getElementById('combo-val');
const scoreVal = document.getElementById('score-val');
const statusTag = document.getElementById('status-tag');
const mainBtn = document.getElementById('main-btn');
const modeBtns = document.querySelectorAll('.mode-btn');

scoreVal.textContent = String(highScore).padStart(4, '0');

// Mode Switch
modeBtns.forEach(btn => {
  btn.addEventListener('click', (e) => {
    if (isPlaying) return;
    modeBtns.forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    currentMode = e.target.dataset.mode;
  });
});

mainBtn.addEventListener('click', startGame);

function startGame() {
  sequence = [];
  playerSequence = [];
  level = 0;
  combo = 1;
  isPlaying = true;
  mainBtn.style.display = 'none';
  nextRound();
}

function nextRound() {
  playerSequence = [];
  level++;
  levelVal.textContent = String(level).padStart(2, '0');
  comboVal.textContent = `x${combo}`;
  statusTag.textContent = currentMode === 'reverse' ? 'MEMORIZE (REVERSE MATCH!)' : 'SCANNING CORE PATTERN...';
  canClick = false;

  sequence.push(Math.floor(Math.random() * 4));
  playSequence();
}

function playSequence() {
  let i = 0;
  const speed = currentMode === 'hyper' ? 250 : Math.max(220, 550 - level * 25);

  const interval = setInterval(() => {
    flashCore(sequence[i]);
    i++;
    if (i >= sequence.length) {
      clearInterval(interval);
      setTimeout(() => {
        canClick = true;
        statusTag.textContent = 'YOUR TURN // REPLICATE';
      }, 400);
    }
  }, speed);
}

function flashCore(id) {
  const core = cores[id];
  playSound(id);

  triggerExplosion(core.position.x, core.position.y, core.position.z, core.userData.baseColor);

  core.userData.inner.material.emissive.setHex(core.userData.baseColor);
  core.userData.outer.material.opacity = 1.0;
  core.scale.set(1.25, 1.25, 1.25);

  setTimeout(() => {
    core.userData.inner.material.emissive.setHex(0x000000);
    core.userData.outer.material.opacity = 0.4;
    core.scale.set(1, 1, 1);
  }, 280);
}

// Raycasting Click
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

window.addEventListener('pointerdown', (e) => {
  if (!canClick || !isPlaying) return;

  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(cores.map(c => c.userData.inner));

  if (intersects.length > 0) {
    const hitMesh = intersects[0].object;
    const parentGroup = hitMesh.parent;
    const id = parentGroup.userData.id;

    flashCore(id);
    playerSequence.push(id);
    checkInput(playerSequence.length - 1);
  }
});

function checkInput(index) {
  let targetSeq = [...sequence];
  if (currentMode === 'reverse') targetSeq.reverse();

  if (playerSequence[index] !== targetSeq[index]) {
    playSound(0, true);
    statusTag.textContent = 'SYSTEM OVERLOAD // TERMINATED';
    gameOver();
    return;
  }

  if (playerSequence.length === sequence.length) {
    canClick = false;
    combo++;
    statusTag.textContent = 'SYNCHRONIZED // STAGE CLEAR';

    const currentScore = level * combo * 100;
    if (currentScore > highScore) {
      highScore = currentScore;
      localStorage.setItem('omegaCoreHighScore', highScore);
      scoreVal.textContent = String(highScore).padStart(4, '0');
    }

    setTimeout(nextRound, 900);
  }
}

function gameOver() {
  isPlaying = false;
  canClick = false;
  mainBtn.style.display = 'block';
  mainBtn.textContent = 'REBOOT SYSTEM';
}

// Render Loop
function animate() {
  requestAnimationFrame(animate);

  // Rotation & Floating
  coreGroup.rotation.y = Math.sin(Date.now() * 0.0008) * 0.2;
  cores.forEach(c => {
    c.userData.outer.rotation.x += 0.01;
    c.userData.outer.rotation.y += 0.01;
  });

  // Animated Grid
  gridHelper.position.z = (Date.now() * 0.002) % 1.5;

  updateParticles();
  renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});