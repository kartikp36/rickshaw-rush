// game.js
const canvas = document.getElementById('gameCanvas');

// UI Elements
const startScreen = document.getElementById('start-screen');
const gameOverScreen = document.getElementById('game-over-screen');
const hud = document.getElementById('hud');
const scoreDisplay = document.getElementById('score-display');
const finalScoreDisplay = document.getElementById('final-score');
const bestScoreDisplay = document.getElementById('best-score');
const nearMissContainer = document.getElementById('near-miss-container');

// Game State
let gameState = 'START'; // START, PLAYING, GAMEOVER
let score = 0;
let bestScore = localStorage.getItem('rickshawRushBestScore') || 0;
let lastTime = 0;
let gameSpeed = 20; // Units per second in 3D
let animationId = null;

// Game Configuration
const LANE_COUNT = 3; // 3 lanes for 3D is better visually
const LANE_WIDTH = 4;
const ROAD_WIDTH = LANE_COUNT * LANE_WIDTH;

// Three.js Setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB); // Sky blue
scene.fog = new THREE.Fog(0x87CEEB, 20, 100);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
// Position camera slightly behind and above player
camera.position.set(0, 7, 12);
camera.lookAt(0, 0, -20);

const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(-10, 20, 10);
dirLight.castShadow = true;
dirLight.shadow.camera.top = 50;
dirLight.shadow.camera.bottom = -50;
dirLight.shadow.camera.left = -50;
dirLight.shadow.camera.right = 50;
dirLight.shadow.camera.near = 0.1;
dirLight.shadow.camera.far = 100;
scene.add(dirLight);

// Environment (Road)
const roadGroup = new THREE.Group();
scene.add(roadGroup);

// Asphalt
const roadGeo = new THREE.PlaneGeometry(ROAD_WIDTH, 200);
const roadMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.8 });
const road = new THREE.Mesh(roadGeo, roadMat);
road.rotation.x = -Math.PI / 2;
road.position.z = -50;
road.receiveShadow = true;
roadGroup.add(road);

// Grass/Ground
const groundGeo = new THREE.PlaneGeometry(200, 200);
const groundMat = new THREE.MeshStandardMaterial({ color: 0x27ae60 });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.position.z = -50;
ground.position.y = -0.1;
ground.receiveShadow = true;
scene.add(ground);

// Lane Markers
const markers = [];
const markerGeo = new THREE.PlaneGeometry(0.2, 3);
const markerMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

for (let i = 0; i < LANE_COUNT - 1; i++) {
    const xPos = -ROAD_WIDTH / 2 + (i + 1) * LANE_WIDTH;
    for (let j = 0; j < 10; j++) {
        const marker = new THREE.Mesh(markerGeo, markerMat);
        marker.rotation.x = -Math.PI / 2;
        marker.position.set(xPos, 0.01, -j * 10);
        roadGroup.add(marker);
        markers.push(marker);
    }
}

// Side borders
const borderGeo = new THREE.BoxGeometry(0.5, 0.5, 200);
const borderMat = new THREE.MeshStandardMaterial({ color: 0xbdc3c7 });
const leftBorder = new THREE.Mesh(borderGeo, borderMat);
leftBorder.position.set(-ROAD_WIDTH/2 - 0.25, 0.25, -50);
leftBorder.receiveShadow = true;
roadGroup.add(leftBorder);

const rightBorder = new THREE.Mesh(borderGeo, borderMat);
rightBorder.position.set(ROAD_WIDTH/2 + 0.25, 0.25, -50);
rightBorder.receiveShadow = true;
roadGroup.add(rightBorder);

// Audio Context (Placeholder for now)
let audioCtx = null;
function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
}
function playHonkSound() {}
function playCrashSound() {}
function playScoreSound() {}

// Player Class (Rickshaw 3D)
class Player {
    constructor() {
        this.lane = 1; // Middle lane of 3 (0, 1, 2)
        this.targetX = this.getLaneX(this.lane);
        this.width = 1.5;
        this.height = 2;
        this.depth = 2.5;
        
        // Bounding Box for collision
        this.box = new THREE.Box3();
        
        // Create 3D Rickshaw Group
        this.mesh = new THREE.Group();
        
        // Base/Chassis (Green)
        const baseGeo = new THREE.BoxGeometry(this.width, 0.5, this.depth);
        const baseMat = new THREE.MeshStandardMaterial({ color: 0x2ecc71 });
        const base = new THREE.Mesh(baseGeo, baseMat);
        base.position.y = 0.5;
        base.castShadow = true;
        this.mesh.add(base);
        
        // Cabin/Top (Yellow)
        const cabGeo = new THREE.BoxGeometry(this.width * 0.9, 1.2, this.depth * 0.6);
        const cabMat = new THREE.MeshStandardMaterial({ color: 0xf1c40f });
        const cab = new THREE.Mesh(cabGeo, cabMat);
        cab.position.set(0, 1.35, -0.4);
        cab.castShadow = true;
        this.mesh.add(cab);
        
        // Roof (Orange)
        const roofGeo = new THREE.BoxGeometry(this.width * 1.05, 0.1, this.depth * 0.9);
        const roofMat = new THREE.MeshStandardMaterial({ color: 0xe67e22 });
        const roof = new THREE.Mesh(roofGeo, roofMat);
        roof.position.set(0, 2.0, -0.2);
        roof.castShadow = true;
        this.mesh.add(roof);
        
        // Wheels (Black)
        const wheelGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.2, 16);
        const wheelMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
        wheelGeo.rotateZ(Math.PI / 2);
        
        const frontWheel = new THREE.Mesh(wheelGeo, wheelMat);
        frontWheel.position.set(0, 0.3, 0.8);
        this.mesh.add(frontWheel);
        
        const rearLeftWheel = new THREE.Mesh(wheelGeo, wheelMat);
        rearLeftWheel.position.set(-this.width/2 + 0.1, 0.3, -0.8);
        this.mesh.add(rearLeftWheel);
        
        const rearRightWheel = new THREE.Mesh(wheelGeo, wheelMat);
        rearRightWheel.position.set(this.width/2 - 0.1, 0.3, -0.8);
        this.mesh.add(rearRightWheel);
        
        // Position player on road
        this.mesh.position.set(this.targetX, 0, 0);
        scene.add(this.mesh);
    }
    
    getLaneX(laneIndex) {
        // lanes: 0, 1, 2. Map to world X coordinates.
        return (laneIndex - 1) * LANE_WIDTH;
    }
    
    move(direction) {
        if (direction === -1 && this.lane > 0) {
            this.lane--;
        } else if (direction === 1 && this.lane < LANE_COUNT - 1) {
            this.lane++;
        }
        this.targetX = this.getLaneX(this.lane);
    }
    
    update(deltaTime) {
        // Smooth slide to target lane
        const slideSpeed = 15;
        const dx = this.targetX - this.mesh.position.x;
        this.mesh.position.x += dx * slideSpeed * deltaTime;
        
        // Add slight tilt when turning
        this.mesh.rotation.z = -dx * 0.2;
        
        // Update bounding box
        this.box.setFromObject(this.mesh);
    }
    
    destroy() {
        scene.remove(this.mesh);
    }
}

let player = null;

// Input Handling
window.addEventListener('keydown', (e) => {
    if (gameState !== 'PLAYING' || !player) return;
    if (e.key === 'ArrowLeft' || e.key === 'a') {
        player.move(-1);
    } else if (e.key === 'ArrowRight' || e.key === 'd') {
        player.move(1);
    }
});

canvas.addEventListener('touchstart', (e) => {
    if (gameState !== 'PLAYING' || !player) return;
    const touch = e.touches[0];
    if (touch.clientX < window.innerWidth / 2) {
        player.move(-1);
    } else {
        player.move(1);
    }
}, {passive: false});

// Obstacle Class (3D)
class Obstacle {
    constructor(lane, type) {
        this.lane = lane;
        this.type = type;
        this.active = true;
        this.passedPlayer = false;
        
        this.mesh = new THREE.Group();
        this.box = new THREE.Box3();
        
        const xPos = (this.lane - 1) * LANE_WIDTH;
        
        if (type === 'car') {
            this.speedMultiplier = 0.8;
            const geo = new THREE.BoxGeometry(1.6, 1.2, 3);
            const mat = new THREE.MeshStandardMaterial({ color: 0xe74c3c });
            const body = new THREE.Mesh(geo, mat);
            body.position.y = 0.6;
            body.castShadow = true;
            this.mesh.add(body);
        } else if (type === 'truck') {
            this.speedMultiplier = 0.6;
            const geo = new THREE.BoxGeometry(2, 2.5, 5);
            const mat = new THREE.MeshStandardMaterial({ color: 0x3498db });
            const body = new THREE.Mesh(geo, mat);
            body.position.y = 1.25;
            body.castShadow = true;
            this.mesh.add(body);
        } else if (type === 'cow') {
            this.speedMultiplier = 0; // Static
            const geo = new THREE.BoxGeometry(1, 1.5, 2);
            const mat = new THREE.MeshStandardMaterial({ color: 0xecf0f1 });
            const body = new THREE.Mesh(geo, mat);
            body.position.y = 0.75;
            body.castShadow = true;
            this.mesh.add(body);
        }
        
        this.mesh.position.set(xPos, 0, -80); // Spawn far away
        scene.add(this.mesh);
    }
    
    update(deltaTime) {
        let actualSpeed = gameSpeed;
        if (this.type !== 'cow') {
            actualSpeed = gameSpeed * (1 - this.speedMultiplier);
        }
        
        this.mesh.position.z += actualSpeed * deltaTime;
        
        this.box.setFromObject(this.mesh);
        
        // Deactivate if passed behind camera
        if (this.mesh.position.z > 15) {
            this.active = false;
        }
    }
    
    destroy() {
        scene.remove(this.mesh);
    }
}

let obstacles = [];
let obstacleSpawnTimer = 0;
let obstacleSpawnInterval = 1.5;

// 3D Particles
let particles = [];
class Particle {
    constructor(x, y, z, color) {
        this.mesh = new THREE.Mesh(
            new THREE.BoxGeometry(0.2, 0.2, 0.2),
            new THREE.MeshBasicMaterial({ color: color })
        );
        this.mesh.position.set(x, y, z);
        scene.add(this.mesh);
        
        const angle1 = Math.random() * Math.PI * 2;
        const angle2 = Math.random() * Math.PI * 2;
        const speed = Math.random() * 15 + 5;
        
        this.vx = Math.cos(angle1) * Math.cos(angle2) * speed;
        this.vy = Math.sin(angle1) * speed + 5; // Bias upwards
        this.vz = Math.cos(angle1) * Math.sin(angle2) * speed;
        
        this.life = 1.0;
    }
    
    update(deltaTime) {
        this.vy -= 20 * deltaTime; // Gravity
        this.mesh.position.x += this.vx * deltaTime;
        this.mesh.position.y += this.vy * deltaTime;
        this.mesh.position.z += this.vz * deltaTime;
        
        this.mesh.rotation.x += this.vx * deltaTime;
        this.mesh.rotation.y += this.vy * deltaTime;
        
        this.life -= deltaTime;
        this.mesh.scale.setScalar(Math.max(0, this.life));
    }
    
    destroy() {
        scene.remove(this.mesh);
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
    }
}

function spawnExplosion(x, y, z) {
    for (let i = 0; i < 20; i++) {
        particles.push(new Particle(x, y, z, 0xe74c3c)); // Red
        particles.push(new Particle(x, y, z, 0xf1c40f)); // Yellow
    }
}

let screenShakeTime = 0;

// Handle resizing
function resizeCanvas() {
    const container = document.getElementById('game-container');
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas(); // Initial call

// Base game loop structure
function gameLoop(timestamp) {
    const deltaTime = (timestamp - lastTime) / 1000;
    lastTime = timestamp;
    
    // Always update particles even if game over to let explosion finish
    for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].update(deltaTime);
        if (particles[i].life <= 0) {
            particles[i].destroy();
            particles.splice(i, 1);
        }
    }

    // Screen Shake
    if (screenShakeTime > 0) {
        screenShakeTime -= deltaTime;
        const magnitude = 0.5 * screenShakeTime;
        camera.position.x = (Math.random() - 0.5) * magnitude;
        camera.position.y = 7 + (Math.random() - 0.5) * magnitude;
    } else {
        camera.position.x = 0;
        camera.position.y = 7;
    }

    if (gameState === 'PLAYING') {
        update(deltaTime);
    }
    
    renderer.render(scene, camera);

    animationId = requestAnimationFrame(gameLoop);
}

function update(deltaTime) {
    // Animate road markers to give sense of speed
    markers.forEach(marker => {
        marker.position.z += gameSpeed * deltaTime;
        if (marker.position.z > 10) {
            marker.position.z -= 100;
        }
    });
    
    if (player) {
        player.update(deltaTime);
    }
    
    // Spawn obstacles
    obstacleSpawnTimer += deltaTime;
    obstacleSpawnInterval = Math.max(0.4, 1.5 - (gameSpeed - 20) / 40); // Faster spawns as speed increases
    
    if (obstacleSpawnTimer >= obstacleSpawnInterval) {
        obstacleSpawnTimer = 0;
        const lane = Math.floor(Math.random() * LANE_COUNT);
        const rand = Math.random();
        let type = 'car';
        if (rand > 0.9) type = 'cow';
        else if (rand > 0.6) type = 'truck';
        
        obstacles.push(new Obstacle(lane, type));
    }
    
    // Increase game speed and score
    gameSpeed += deltaTime * 0.2; // Slowly increase
    score += deltaTime * 10;
    scoreDisplay.textContent = `Score: ${Math.floor(score)}`;

    // Update obstacles
    for (let i = obstacles.length - 1; i >= 0; i--) {
        const obs = obstacles[i];
        obs.update(deltaTime);
        
        // Collision Detection using Three.js Box3
        if (player.box.intersectsBox(obs.box)) {
            // Collision!
            playCrashSound();
            spawnExplosion(player.mesh.position.x, player.mesh.position.y + 1, player.mesh.position.z);
            screenShakeTime = 0.5;
            gameOver();
            return;
        }
        
        // Near Miss Detection
        if (!obs.passedPlayer && obs.mesh.position.z > player.mesh.position.z + player.depth / 2) {
            obs.passedPlayer = true;
            
            // Check lateral distance
            const dx = Math.abs(player.mesh.position.x - obs.mesh.position.x);
            // If close enough laterally to count as a near miss (but didn't collide)
            if (dx > player.width / 2 && dx < LANE_WIDTH * 0.8) {
                score += 50;
                playScoreSound();
                showNearMissText();
            }
        }
        
        if (!obs.active) {
            obs.destroy();
            obstacles.splice(i, 1);
        }
    }
}

function showNearMissText() {
    const text = document.createElement('div');
    text.className = 'near-miss-text';
    text.innerText = 'Near Miss!';
    
    // Position roughly near the middle top
    text.style.left = '50%';
    text.style.top = '30%';
    text.style.transform = 'translate(-50%, 0)';
    
    nearMissContainer.appendChild(text);
    
    // Remove after animation finishes
    setTimeout(() => {
        if (text.parentNode === nearMissContainer) {
            nearMissContainer.removeChild(text);
        }
    }, 1000);
}

function startGame() {
    initAudio();
    gameState = 'PLAYING';
    score = 0;
    gameSpeed = 20;
    nearMissContainer.innerHTML = '';
    
    startScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');
    hud.classList.remove('hidden');
    
    if (player) player.destroy();
    player = new Player();
    
    obstacles.forEach(obs => obs.destroy());
    obstacles = [];
    obstacleSpawnTimer = 0;
    
    particles.forEach(p => p.destroy());
    particles = [];
    screenShakeTime = 0;
    
    if (animationId) cancelAnimationFrame(animationId);
    lastTime = performance.now();
    animationId = requestAnimationFrame(gameLoop);
}

startScreen.addEventListener('click', startGame);
gameOverScreen.addEventListener('click', startGame);

// Render initial scene
renderer.render(scene, camera);
