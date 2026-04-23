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
let nextSpeedMilestone = 100; // Boost speed at 100, 200, 300, etc.
let animationId = null;

// Power-up States
let invincibilityTimer = 0;
let multiplierTimer = 0;

// Game Configuration
const LANE_COUNT = 4; // 4 lanes
const LANE_WIDTH = 4;
const ROAD_WIDTH = LANE_COUNT * LANE_WIDTH;

// Three.js Setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB); // Sky blue
scene.fog = new THREE.Fog(0x87CEEB, 20, 100);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
// Position camera lower and closer to see wheels better
camera.position.set(0, 5, 10);
camera.lookAt(0, 1, -20);

const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.7); // Slightly brighter ambient
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
// Move light slightly to the side to create better highlights on wheels
dirLight.position.set(-15, 20, 15);
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
        this.lane = 1; // Start in lane 1 (of 0, 1, 2, 3)
        this.targetX = this.getLaneX(this.lane);
        this.width = 1.5;
        this.height = 2;
        this.depth = 2.5;
        
        // Bounding Box for collision
        this.box = new THREE.Box3();
        
        // Create 3D Rickshaw Group
        this.mesh = new THREE.Group();
        
        // Materials based on reference image
        const blackMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 });
        const yellowMat = new THREE.MeshStandardMaterial({ color: 0xffd700, roughness: 0.4 });
        const greenMat = new THREE.MeshStandardMaterial({ color: 0x117722, roughness: 0.5 });
        const greyMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.5 });
        const clothMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 }); // Canvas roof

        // 1. Lower Chassis (Green Base)
        const chassisGeo = new THREE.BoxGeometry(this.width * 0.9, 0.4, this.depth * 0.9);
        const chassis = new THREE.Mesh(chassisGeo, greenMat);
        chassis.position.set(0, 0.6, -0.1);
        chassis.castShadow = true;
        this.mesh.add(chassis);

        // 2. Cabin Lower Body (Yellow)
        const cabLowerGeo = new THREE.BoxGeometry(this.width * 0.95, 0.7, this.depth * 0.7);
        const cabLower = new THREE.Mesh(cabLowerGeo, yellowMat);
        cabLower.position.set(0, 1.15, -0.2);
        cabLower.castShadow = true;
        this.mesh.add(cabLower);

        // 3. Cabin Back rest / rear panel (Yellow/Black)
        const rearPanelGeo = new THREE.BoxGeometry(this.width * 0.95, 1.2, 0.1);
        const rearPanel = new THREE.Mesh(rearPanelGeo, blackMat);
        rearPanel.position.set(0, 1.6, -this.depth * 0.55 + 0.05);
        rearPanel.castShadow = true;
        this.mesh.add(rearPanel);

        // 4. Roof (Black Canvas)
        // Main roof
        const roofGeo = new THREE.BoxGeometry(this.width * 0.95, 0.1, this.depth * 0.8);
        const roof = new THREE.Mesh(roofGeo, clothMat);
        roof.position.set(0, 2.2, -0.15);
        roof.castShadow = true;
        this.mesh.add(roof);
        
        // Slanted front roof piece
        const roofFrontGeo = new THREE.BoxGeometry(this.width * 0.95, 0.1, 0.6);
        const roofFront = new THREE.Mesh(roofFrontGeo, clothMat);
        roofFront.position.set(0, 2.1, 0.4);
        roofFront.rotation.x = 0.4;
        roofFront.castShadow = true;
        this.mesh.add(roofFront);

        // Roof support pillars (Front)
        const pillarGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.0, 8);
        const pillarLeft = new THREE.Mesh(pillarGeo, blackMat);
        pillarLeft.position.set(-this.width * 0.45, 1.6, 0.2);
        this.mesh.add(pillarLeft);

        const pillarRight = new THREE.Mesh(pillarGeo, blackMat);
        pillarRight.position.set(this.width * 0.45, 1.6, 0.2);
        this.mesh.add(pillarRight);

        // 5. Driver Front Section / Mudguard (Black)
        const frontMudguardGeo = new THREE.CylinderGeometry(0.45, 0.45, this.width * 0.4, 16, 1, false, 0, Math.PI);
        const frontMudguard = new THREE.Mesh(frontMudguardGeo, blackMat);
        frontMudguard.rotation.z = Math.PI / 2;
        frontMudguard.position.set(0, 0.7, 1.0);
        this.mesh.add(frontMudguard);

        // Steering Column
        const steeringGeo = new THREE.CylinderGeometry(0.05, 0.05, 1.2, 8);
        const steering = new THREE.Mesh(steeringGeo, greyMat);
        steering.rotation.x = -0.3;
        steering.position.set(0, 1.1, 0.8);
        this.mesh.add(steering);

        // Handlebars
        const handleGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.8, 8);
        const handle = new THREE.Mesh(handleGeo, blackMat);
        handle.rotation.z = Math.PI / 2;
        handle.position.set(0, 1.6, 0.65);
        this.mesh.add(handle);

        // 6. Windshield (Half-glass)
        const glassGeo = new THREE.BoxGeometry(this.width * 0.85, 0.5, 0.05);
        const glassMat = new THREE.MeshStandardMaterial({ color: 0x87CEEB, transparent: true, opacity: 0.4 });
        const windshield = new THREE.Mesh(glassGeo, glassMat);
        windshield.position.set(0, 1.7, 0.25);
        this.mesh.add(windshield);
        
        // 7. Headlight (Single front light)
        const lightGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.15, 16);
        const lightMat = new THREE.MeshBasicMaterial({ color: 0xffffee });
        const lightCasingMat = new THREE.MeshStandardMaterial({ color: 0x111111 });

        const headlightGroup = new THREE.Group();
        const lightBulb = new THREE.Mesh(lightGeo, lightMat);
        lightBulb.rotation.x = Math.PI / 2;

        const lightCasingGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.1, 16);
        const lightCasing = new THREE.Mesh(lightCasingGeo, lightCasingMat);
        lightCasing.rotation.x = Math.PI / 2;
        lightCasing.position.z = -0.05;

        headlightGroup.add(lightBulb);
        headlightGroup.add(lightCasing);
        headlightGroup.position.set(0, 0.9, 1.3);
        this.mesh.add(headlightGroup);

        // 8. Wheels (3-wheel setup)
        const wheelRadius = 0.35;
        const wheelThickness = 0.15;
        const wheelGeo = new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelThickness, 24);
        const wheelRubberMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
        wheelGeo.rotateZ(Math.PI / 2);
        
        const rimGeo = new THREE.CylinderGeometry(wheelRadius * 0.6, wheelRadius * 0.6, wheelThickness + 0.02, 16);
        const rimMaterial = new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.6, roughness: 0.4 });
        rimGeo.rotateZ(Math.PI / 2);
        
        const createWheel = () => {
            const wheel = new THREE.Group();
            wheel.add(new THREE.Mesh(wheelGeo, wheelRubberMat));
            wheel.add(new THREE.Mesh(rimGeo, rimMaterial));
            return wheel;
        };

        // Front Wheel (Center)
        const frontWheel = createWheel();
        frontWheel.position.set(0, wheelRadius, 1.0);
        this.mesh.add(frontWheel);
        
        // Rear Left Wheel
        const rearLeftWheel = createWheel();
        rearLeftWheel.position.set(-this.width * 0.45, wheelRadius, -0.4);
        this.mesh.add(rearLeftWheel);
        
        // Rear Right Wheel
        const rearRightWheel = createWheel();
        rearRightWheel.position.set(this.width * 0.45, wheelRadius, -0.4);
        this.mesh.add(rearRightWheel);
        
        // Passenger Seats (Black)
        const seatGeo = new THREE.BoxGeometry(this.width * 0.8, 0.1, 0.5);
        const seat = new THREE.Mesh(seatGeo, blackMat);
        seat.position.set(0, 0.9, -0.2);
        this.mesh.add(seat);

        // Position player on road
        this.mesh.position.set(this.targetX, 0, 0);
        scene.add(this.mesh);
    }
    
    getLaneX(laneIndex) {
        // lanes: 0, 1, 2, 3. Map to world X coordinates.
        return (laneIndex - 1.5) * LANE_WIDTH;
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
        
        const xPos = (this.lane - 1.5) * LANE_WIDTH;
        
        // Wheel geometries for reuse
        const wheelRadius = 0.35;
        const wheelGeo = new THREE.CylinderGeometry(wheelRadius, wheelRadius, 0.2, 16);
        wheelGeo.rotateZ(Math.PI / 2);
        const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
        
        const rimGeo = new THREE.CylinderGeometry(wheelRadius * 0.5, wheelRadius * 0.5, 0.22, 16);
        rimGeo.rotateZ(Math.PI / 2);
        const rimMat = new THREE.MeshStandardMaterial({ color: 0x999999 });

        function createWheel() {
            const w = new THREE.Group();
            w.add(new THREE.Mesh(wheelGeo, wheelMat));
            w.add(new THREE.Mesh(rimGeo, rimMat));
            return w;
        }

        if (type === 'car') {
            this.speedMultiplier = 0.8;
            const width = 1.6;
            const height = 1.2;
            const depth = 3;
            
            const mat = new THREE.MeshStandardMaterial({ color: 0xe74c3c });
            
            // Lower body
            const lowerGeo = new THREE.BoxGeometry(width, height * 0.5, depth);
            const lowerBody = new THREE.Mesh(lowerGeo, mat);
            lowerBody.position.y = wheelRadius + height * 0.25;
            lowerBody.castShadow = true;
            this.mesh.add(lowerBody);
            
            // Cabin
            const cabGeo = new THREE.BoxGeometry(width * 0.9, height * 0.5, depth * 0.5);
            const cabBody = new THREE.Mesh(cabGeo, mat);
            cabBody.position.set(0, wheelRadius + height * 0.75, -depth * 0.1);
            cabBody.castShadow = true;
            this.mesh.add(cabBody);
            
            // Windows
            const winMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.2 });
            const windshield = new THREE.Mesh(new THREE.BoxGeometry(width * 0.8, height * 0.4, 0.05), winMat);
            windshield.position.set(0, wheelRadius + height * 0.75, depth * 0.16);
            this.mesh.add(windshield);
            
            // Headlights
            const lightGeo = new THREE.BoxGeometry(0.3, 0.2, 0.05);
            const lightMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
            const leftLight = new THREE.Mesh(lightGeo, lightMat);
            leftLight.position.set(-width/2 + 0.25, wheelRadius + height * 0.25, depth/2 + 0.01);
            this.mesh.add(leftLight);
            
            const rightLight = new THREE.Mesh(lightGeo, lightMat);
            rightLight.position.set(width/2 - 0.25, wheelRadius + height * 0.25, depth/2 + 0.01);
            this.mesh.add(rightLight);

            // Wheels (4)
            const wheelOffsets = [
                [-width/2, depth/2 - 0.5], [width/2, depth/2 - 0.5],
                [-width/2, -depth/2 + 0.5], [width/2, -depth/2 + 0.5]
            ];
            wheelOffsets.forEach(pos => {
                const w = createWheel();
                w.position.set(pos[0], wheelRadius, pos[1]);
                this.mesh.add(w);
            });
            
        } else if (type === 'truck') {
            this.speedMultiplier = 0.6;
            const width = 2;
            const height = 2.5;
            const depth = 5;
            
            const cabMat = new THREE.MeshStandardMaterial({ color: 0x2c3e50 });
            const boxMat = new THREE.MeshStandardMaterial({ color: 0x3498db });
            
            // Cab
            const cabGeo = new THREE.BoxGeometry(width, height * 0.8, depth * 0.3);
            const cab = new THREE.Mesh(cabGeo, cabMat);
            cab.position.set(0, wheelRadius + height * 0.4, depth * 0.35);
            cab.castShadow = true;
            this.mesh.add(cab);
            
            // Cargo Box
            const boxGeo = new THREE.BoxGeometry(width, height, depth * 0.7);
            const cargo = new THREE.Mesh(boxGeo, boxMat);
            cargo.position.set(0, wheelRadius + height * 0.5, -depth * 0.15);
            cargo.castShadow = true;
            this.mesh.add(cargo);
            
            // Windshield
            const winMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.1 });
            const windshield = new THREE.Mesh(new THREE.BoxGeometry(width * 0.9, height * 0.3, 0.05), winMat);
            windshield.position.set(0, wheelRadius + height * 0.5, depth * 0.51);
            this.mesh.add(windshield);
            
            // Headlights
            const lightGeo = new THREE.BoxGeometry(0.4, 0.2, 0.05);
            const lightMat = new THREE.MeshBasicMaterial({ color: 0xffaaaa }); // slight red tint
            const leftLight = new THREE.Mesh(lightGeo, lightMat);
            leftLight.position.set(-width/2 + 0.3, wheelRadius + 0.3, depth * 0.51);
            this.mesh.add(leftLight);
            
            const rightLight = new THREE.Mesh(lightGeo, lightMat);
            rightLight.position.set(width/2 - 0.3, wheelRadius + 0.3, depth * 0.51);
            this.mesh.add(rightLight);
            
            // Wheels (6)
            const wheelOffsets = [
                [-width/2, depth * 0.35], [width/2, depth * 0.35], // Front
                [-width/2, -depth * 0.1], [width/2, -depth * 0.1], // Middle
                [-width/2, -depth * 0.4], [width/2, -depth * 0.4]  // Rear
            ];
            wheelOffsets.forEach(pos => {
                const w = createWheel();
                w.position.set(pos[0], wheelRadius, pos[1]);
                this.mesh.add(w);
            });
            
        } else if (type === 'cow') {
            this.speedMultiplier = 0; // Static
            const cowGroup = new THREE.Group();

            const bodyMat = new THREE.MeshStandardMaterial({ color: 0xecf0f1 }); // White
            const spotMat = new THREE.MeshStandardMaterial({ color: 0x111111 }); // Black spots/details
            
            // Main body
            const bodyGeo = new THREE.BoxGeometry(0.8, 0.8, 1.6);
            const body = new THREE.Mesh(bodyGeo, bodyMat);
            body.position.y = 0.8;
            body.castShadow = true;
            cowGroup.add(body);
            
            // Spot on body
            const spotGeo = new THREE.PlaneGeometry(0.5, 0.5);
            const spot = new THREE.Mesh(spotGeo, spotMat);
            spot.position.set(0.41, 0.8, 0.2); // Just outside right side
            spot.rotation.y = Math.PI / 2;
            cowGroup.add(spot);
            
            const spot2 = new THREE.Mesh(spotGeo, spotMat);
            spot2.position.set(-0.41, 0.9, -0.3); // Just outside left side
            spot2.rotation.y = -Math.PI / 2;
            cowGroup.add(spot2);
            
            // Head
            const headGeo = new THREE.BoxGeometry(0.5, 0.5, 0.6);
            const head = new THREE.Mesh(headGeo, bodyMat);
            head.position.set(0, 1.2, 0.9);
            head.castShadow = true;
            cowGroup.add(head);
            
            // Snout (black)
            const snoutGeo = new THREE.BoxGeometry(0.4, 0.2, 0.1);
            const snout = new THREE.Mesh(snoutGeo, spotMat);
            snout.position.set(0, 1.1, 1.25);
            cowGroup.add(snout);
            
            // Horns
            const hornGeo = new THREE.CylinderGeometry(0.02, 0.05, 0.3);
            const hornMat = new THREE.MeshStandardMaterial({ color: 0xdddddd });
            
            const leftHorn = new THREE.Mesh(hornGeo, hornMat);
            leftHorn.position.set(-0.2, 1.5, 0.8);
            leftHorn.rotation.z = -0.3;
            leftHorn.rotation.x = -0.2;
            cowGroup.add(leftHorn);
            
            const rightHorn = new THREE.Mesh(hornGeo, hornMat);
            rightHorn.position.set(0.2, 1.5, 0.8);
            rightHorn.rotation.z = 0.3;
            rightHorn.rotation.x = -0.2;
            cowGroup.add(rightHorn);
            
            // Legs (4)
            const legGeo = new THREE.BoxGeometry(0.2, 0.6, 0.2);
            const legOffsets = [
                [-0.3, 0.3, 0.6], [0.3, 0.3, 0.6],   // Front
                [-0.3, 0.3, -0.6], [0.3, 0.3, -0.6]  // Back
            ];
            
            legOffsets.forEach(pos => {
                const leg = new THREE.Mesh(legGeo, bodyMat);
                leg.position.set(...pos);
                leg.castShadow = true;
                cowGroup.add(leg);
            });

            // Rotate cow so it stands horizontally
            cowGroup.rotation.y = Math.PI / 2;
            this.mesh.add(cowGroup);
        }
        
        // Set orientation based on lane and traffic direction
        if (this.type !== 'cow') {
            // Default models are created with headlights at +Z.
            // Player starts at Z=0 and moves down the -Z axis (conceptually).
            // Objects moving towards the player (+Z direction) should face +Z (rotation 0).
            // Objects moving away from the player (-Z direction) should face -Z (rotation Math.PI).

            if (this.lane >= 2) {
                // Oncoming traffic (lanes 2, 3) - coming towards player. Headlights should point towards player (+Z).
                this.mesh.rotation.y = 0;
            } else {
                // Same direction traffic (lanes 0, 1) - going same way as player. Headlights should point away (-Z).
                this.mesh.rotation.y = Math.PI;
            }
        }

        this.mesh.position.set(xPos, 0, -80); // Spawn far away
        scene.add(this.mesh);
    }
    
    update(deltaTime) {
        let actualSpeed = gameSpeed;

        if (this.type !== 'cow') {
            if (this.lane >= 2) {
                // Oncoming traffic (lanes 2, 3) moving very fast towards player
                actualSpeed = gameSpeed + (gameSpeed * this.speedMultiplier);
            } else {
                // Traffic in same direction (lanes 0, 1) moving slower than player
                actualSpeed = gameSpeed * (1 - this.speedMultiplier);
            }
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
let obstacleSpawnInterval = 2.5;

// Shared Geometries and Materials for Collectibles
// Coin
const coinCanvas = document.createElement('canvas');
coinCanvas.width = 128;
coinCanvas.height = 128;
const ctx = coinCanvas.getContext('2d');
ctx.fillStyle = '#f1c40f'; // Gold
ctx.beginPath();
ctx.arc(64, 64, 60, 0, Math.PI * 2);
ctx.fill();
ctx.strokeStyle = '#f39c12';
ctx.lineWidth = 4;
ctx.beginPath();
ctx.arc(64, 64, 52, 0, Math.PI * 2);
ctx.stroke();
ctx.fillStyle = '#d35400';
ctx.font = 'bold 40px Arial';
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';
ctx.fillText('OTP', 64, 64);
const coinTex = new THREE.CanvasTexture(coinCanvas);
const coinGeo = new THREE.CylinderGeometry(0.8, 0.8, 0.2, 32);
coinGeo.rotateX(Math.PI / 2);
const coinMat = new THREE.MeshStandardMaterial({
    color: 0xf1c40f,
    metalness: 0.2, // Lower metalness to prevent black appearance without env map
    roughness: 0.4,
    map: coinTex // Apply canvas texture
});

// Chai
const cupGeo = new THREE.CylinderGeometry(0.4, 0.3, 0.6, 16);
const cupMat = new THREE.MeshStandardMaterial({ color: 0xecf0f1 }); // White cup
const liquidGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.05, 16);
const liquidMat = new THREE.MeshStandardMaterial({ color: 0xc39b77 }); // Tea color
const handleGeo = new THREE.TorusGeometry(0.2, 0.05, 8, 16);
const handleMat = new THREE.MeshStandardMaterial({ color: 0xecf0f1 });

// Music
const boxGeo = new THREE.BoxGeometry(0.8, 0.8, 0.8);
const boxMat = new THREE.MeshStandardMaterial({ color: 0x9b59b6, metalness: 0.1 }); // Purple box
const symbolGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.9, 16);
const symbolMat = new THREE.MeshBasicMaterial({ color: 0xffffff });


// Collectibles Class
class Collectible {
    constructor(lane, type) {
        this.lane = lane;
        this.type = type; // 'coin', 'chai', 'music'
        this.active = true;

        this.mesh = new THREE.Group();
        this.box = new THREE.Box3();

        const xPos = (this.lane - 1.5) * LANE_WIDTH;

        if (type === 'coin') {
            const coinMesh = new THREE.Mesh(coinGeo, coinMat);
            coinMesh.position.y = 1.0;
            this.mesh.add(coinMesh);

            // Animate coin spinning
            this.updateRotation = (deltaTime) => {
                coinMesh.rotation.y += deltaTime * 3;
            };
        } else if (type === 'chai') {
            // Chai cup model
            const cupGroup = new THREE.Group();

            // Cup base
            const cup = new THREE.Mesh(cupGeo, cupMat);
            cup.position.y = 0.3;
            cupGroup.add(cup);

            // Chai liquid
            const liquid = new THREE.Mesh(liquidGeo, liquidMat);
            liquid.position.y = 0.58;
            cupGroup.add(liquid);

            // Handle
            const handle = new THREE.Mesh(handleGeo, handleMat);
            handle.position.set(0.4, 0.3, 0);
            cupGroup.add(handle);

            cupGroup.position.y = 0.5; // Float above ground
            this.mesh.add(cupGroup);

            this.updateRotation = (deltaTime) => {
                cupGroup.rotation.y += deltaTime * 2;
                cupGroup.position.y = 0.5 + Math.sin(Date.now() * 0.005) * 0.2; // Hover effect
            };
        } else if (type === 'music') {
            // Music Box model
            const box = new THREE.Mesh(boxGeo, boxMat);

            // Add a simple symbol on faces
            const symbol1 = new THREE.Mesh(symbolGeo, symbolMat);
            symbol1.rotation.x = Math.PI / 2;
            const symbol2 = new THREE.Mesh(symbolGeo, symbolMat);
            symbol2.rotation.z = Math.PI / 2;
            box.add(symbol1);
            box.add(symbol2);

            box.position.y = 0.8;
            this.mesh.add(box);

            this.updateRotation = (deltaTime) => {
                box.rotation.x += deltaTime * 2;
                box.rotation.y += deltaTime * 3;
            };
        }

        this.mesh.position.set(xPos, 0, -80); // Spawn far away
        scene.add(this.mesh);
    }

    update(deltaTime) {
        this.mesh.position.z += gameSpeed * deltaTime;

        if (this.updateRotation) {
            this.updateRotation(deltaTime);
        }

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

let collectibles = [];
let collectibleSpawnTimer = 0;
let collectibleSpawnInterval = 2.0;

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

    // Ensure all 4 lanes are completely visible on portrait/mobile screens
    // By locking the Horizontal FOV when aspect ratio gets narrow
    const targetHorizontalFov = 90; // Degrees. Wider to ensure all 4 lanes fit horizontally

    // Calculate the necessary vertical FOV to maintain the target horizontal FOV
    const hFovRad = targetHorizontalFov * (Math.PI / 180);
    const vFovRad = 2 * Math.atan(Math.tan(hFovRad / 2) / camera.aspect);
    const calculatedFov = vFovRad * (180 / Math.PI);

    // Use the larger of the base FOV (60) or the calculated FOV
    camera.fov = Math.max(60, calculatedFov);

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
    obstacleSpawnInterval = Math.max(0.6, 2.5 - (gameSpeed - 20) / 30); // Slower initial spawns, gentle increase

    // Spawn Collectibles
    collectibleSpawnTimer += deltaTime;
    if (collectibleSpawnTimer >= collectibleSpawnInterval) {
        collectibleSpawnTimer = 0;
        // Randomize next spawn time a bit
        collectibleSpawnInterval = 1.0 + Math.random() * 2.0;
        const lane = Math.floor(Math.random() * LANE_COUNT);

        let type = 'coin';
        const rand = Math.random();
        if (rand > 0.95) {
            type = 'chai'; // Rare power-up
        } else if (rand > 0.90) {
            type = 'music'; // Rare power-up
        }

        collectibles.push(new Collectible(lane, type));
    }

    if (obstacleSpawnTimer >= obstacleSpawnInterval) {
        obstacleSpawnTimer = 0;
        const lane = Math.floor(Math.random() * LANE_COUNT);
        const rand = Math.random();
        let type = 'car';
        if (rand > 0.9) type = 'cow';
        else if (rand > 0.6) type = 'truck';
        
        obstacles.push(new Obstacle(lane, type));
    }
    
    // Update Power-up Timers
    if (invincibilityTimer > 0) {
        invincibilityTimer -= deltaTime;
    }
    if (multiplierTimer > 0) {
        multiplierTimer -= deltaTime;
    }

    // Increase game speed and score
    gameSpeed += deltaTime * 0.2; // Slowly increase
    let scoreGain = deltaTime * 10;
    if (multiplierTimer > 0) {
        scoreGain *= 2; // Double score multiplier
    }
    score += scoreGain;

    // Milestone speed burst
    if (score >= nextSpeedMilestone) {
        gameSpeed += 5; // Sudden burst of speed
        nextSpeedMilestone += 100;
        showFloatingText('SPEED UP!', player.mesh.position);
    }

    // Display power-up status if active
    let statusText = `Score: ${Math.floor(score)}`;
    if (invincibilityTimer > 0) {
        statusText += ` | Chai (Invincible & Smash): ${Math.ceil(invincibilityTimer)}s`;
    }
    if (multiplierTimer > 0) {
        statusText += ` | Music (2x Score while Vibing!): ${Math.ceil(multiplierTimer)}s`;
    }
    scoreDisplay.textContent = statusText;

    // Update collectibles
    for (let i = collectibles.length - 1; i >= 0; i--) {
        const col = collectibles[i];
        col.update(deltaTime);

        // Collision Detection for collectibles
        if (player.box.intersectsBox(col.box)) {
            if (col.type === 'coin') {
                let coinValue = 100;
                if (multiplierTimer > 0) coinValue *= 2;
                score += coinValue;
                playScoreSound();
                showFloatingText(`+${coinValue} OTP`, col.mesh.position);
            } else if (col.type === 'chai') {
                invincibilityTimer = 10.0; // 10 seconds of invincibility
                playScoreSound();
                showFloatingText('CHAI TIME!', col.mesh.position);
            } else if (col.type === 'music') {
                multiplierTimer = 10.0; // 10 seconds of 2x multiplier
                playScoreSound();
                showFloatingText('VIBING (2x)!', col.mesh.position);
            }
            col.active = false;
        }

        if (!col.active) {
            col.destroy();
            collectibles.splice(i, 1);
        }
    }

    // Update obstacles
    for (let i = obstacles.length - 1; i >= 0; i--) {
        const obs = obstacles[i];
        obs.update(deltaTime);
        
        // Collision Detection using Three.js Box3
        if (player.box.intersectsBox(obs.box)) {
            if (invincibilityTimer > 0) {
                // Smashed obstacle!
                spawnExplosion(obs.mesh.position.x, obs.mesh.position.y + 1, obs.mesh.position.z);
                obs.active = false;
                score += 500;
                showFloatingText('SMASH!', obs.mesh.position);
            } else {
                // Collision!
                playCrashSound();
                spawnExplosion(player.mesh.position.x, player.mesh.position.y + 1, player.mesh.position.z);
                screenShakeTime = 0.5;
                gameOver();
                return;
            }
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

function showFloatingText(msg, position = null) {
    const text = document.createElement('div');
    text.className = 'near-miss-text';
    text.innerText = msg;
    
    // Convert 3D position to 2D screen coordinates if provided
    if (position) {
        const vector = position.clone();
        vector.project(camera);

        const x = (vector.x * .5 + .5) * window.innerWidth;
        const y = (vector.y * -.5 + .5) * window.innerHeight;

        text.style.left = `${x}px`;
        text.style.top = `${y}px`;
        text.style.transform = 'translate(-50%, -100%)';
    } else {
        // Default middle
        text.style.left = '50%';
        text.style.top = '30%';
        text.style.transform = 'translate(-50%, 0)';
    }
    
    nearMissContainer.appendChild(text);
    
    setTimeout(() => {
        if (text.parentNode === nearMissContainer) {
            nearMissContainer.removeChild(text);
        }
    }, 1000);
}

function showNearMissText() {
    showFloatingText('Near Miss!');
}

function gameOver() {
    gameState = 'GAMEOVER';

    const finalScore = Math.floor(score);
    if (finalScore > bestScore) {
        bestScore = finalScore;
        localStorage.setItem('rickshawRushBestScore', bestScore);
    }

    hud.classList.add('hidden');
    finalScoreDisplay.textContent = `Score: ${finalScore}`;
    bestScoreDisplay.textContent = `Best: ${bestScore}`;
    gameOverScreen.classList.remove('hidden');
}

function startGame() {
    initAudio();
    gameState = 'PLAYING';
    score = 0;
    gameSpeed = 20;
    nextSpeedMilestone = 100;
    invincibilityTimer = 0;
    multiplierTimer = 0;
    nearMissContainer.innerHTML = '';
    
    startScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');
    hud.classList.remove('hidden');
    
    if (player) player.destroy();
    player = new Player();
    
    obstacles.forEach(obs => obs.destroy());
    obstacles = [];
    obstacleSpawnTimer = 0;
    
    collectibles.forEach(col => col.destroy());
    collectibles = [];
    collectibleSpawnTimer = 0;

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
