/**
 * RETRO NEON RACER - Game Engine
 * Object-Oriented JavaScript using Canvas API
 */

// --- AUDIO SYNTHESIZER ENGINE (No External Asset Dependencies) ---
const AudioEngine = {
    ctx: null,
    
    init() {
        // Initialize Web Audio context on user interaction to abide by browser security policies
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
    },

    playCrash() {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(120, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(10, this.ctx.currentTime + 0.6);
        
        gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.01, this.ctx.currentTime + 0.6);
        
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.6);
    },

    playScore() {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, this.ctx.currentTime);
        osc.frequency.setValueAtTime(900, this.ctx.currentTime + 0.08);
        
        gain.gain.setValueAtTime(0.05, this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.001, this.ctx.currentTime + 0.2);
        
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.2);
    }
};

// --- BASE ENTITY: CAR ---
class Car {
    constructor(game, laneCount) {
        this.game = game;
        this.laneCount = laneCount;
        this.width = 45;
        this.height = 75;
        this.currentLane = 1; // Start in center-left lane (0-indexed: 0, 1, 2, 3)
        
        // Coordinates matching canvas plane dimensions
        this.x = 0;
        this.y = 0;
        this.targetX = 0;
        
        this.resetPosition();
    }

    resetPosition() {
        this.currentLane = 1;
        this.x = this.game.getLaneCenterX(this.currentLane) - this.width / 2;
        this.targetX = this.x;
        this.y = this.game.canvas.height - this.height - 40; // Static padding from bottom boundary
    }

    moveToLane(laneIndex) {
        if (laneIndex >= 0 && laneIndex < this.laneCount) {
            this.currentLane = laneIndex;
            this.targetX = this.game.getLaneCenterX(laneIndex) - this.width / 2;
        }
    }

    update() {
        // Interpolate horizontal position for smooth side-to-side transitions
        const lerpFactor = 0.25;
        this.x += (this.targetX - this.x) * lerpFactor;
    }

    draw(ctx) {
        ctx.save();
        
        // Outer Shadow Neon Glow setup
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#00f3ff';

        // Draw Player Car Body
        ctx.fillStyle = '#00f3ff';
        ctx.beginPath();
        ctx.roundRect(this.x, this.y, this.width, this.height, 6);
        ctx.fill();

        // Cockpit Glass Graphic
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#05050a';
        ctx.fillRect(this.x + 8, this.y + 22, this.width - 16, 20);

        // Neon Headlights
        ctx.fillStyle = '#fff';
        ctx.fillRect(this.x + 5, this.y, 6, 4);
        ctx.fillRect(this.x + this.width - 11, this.y, 6, 4);

        // Exhaust Fire if Boosting
        if (this.game.isBoosting) {
            ctx.fillStyle = '#ff0055';
            ctx.fillRect(this.x + this.width/2 - 6, this.y + this.height, 12, Math.random() * 15 + 5);
        }

        ctx.restore();
    }
}

// --- ENEMY CAR ENTITY ---
class EnemyCar {
    constructor(game, lane, speed, color) {
        this.game = game;
        this.lane = lane;
        this.width = 45;
        this.height = 75;
        
        this.x = this.game.getLaneCenterX(lane) - this.width / 2;
        this.y = -this.height; // Initialize off-screen top
        this.speed = speed;
        this.color = color;
    }

    update(globalSpeedModifier) {
        // Moves down relative to the player's current speed tier
        this.y += this.speed + globalSpeedModifier;
    }

    draw(ctx) {
        ctx.save();
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.color;

        // Base frame
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.roundRect(this.x, this.y, this.width, this.height, 6);
        ctx.fill();

        // Windshield cabin tint
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(10, 10, 18, 0.8)';
        ctx.fillRect(this.x + 8, this.y + 35, this.width - 16, 18);

        // Tail Lights
        ctx.fillStyle = '#ff0033';
        ctx.fillRect(this.x + 4, this.y + this.height - 4, 6, 4);
        ctx.fillRect(this.x + this.width - 10, this.y + this.height - 4, 6, 4);

        ctx.restore();
    }

    // AABB Bounding Box Collision Engine standard
    getBounds() {
        return {
            left: this.x,
            right: this.x + this.width,
            top: this.y,
            bottom: this.y + this.height
        };
    }
}

// --- MAIN SYSTEM GAME MANAGER ---
class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        
        // Define Architecture Parameters
        this.lanesCount = 4;
        this.laneWidth = 0; // Computed on runtime context configuration
        
        // Game States Variables
        this.score = 0;
        this.baseSpeed = 4;
        this.speedModifier = 0;
        this.isBoosting = false;
        this.gameState = 'START'; // START | RUNNING | PAUSED | GAMEOVER
        
        this.enemies = [];
        this.spawnTimer = 0;
        this.spawnInterval = 110; // Frames step frequency matrix
        this.roadOffset = 0; // Tracks scrolling road geometry position

        // Palette Array for Adversaries
        this.enemyColors = ['#ff0055', '#9d4edd', '#ff9e00', '#00ff66'];

        this.initCanvasResolution();
        this.player = new Car(this, this.lanesCount);
        this.bindInputEvents();
        this.loadHighScore();

        // Start standard Animation Render Frame Loop 
        requestAnimationFrame((timestamp) => this.loop(timestamp));
    }

    initCanvasResolution() {
        // Set fixed canvas logical space boundaries layout context aspect ratio
        this.canvas.width = 440;
        this.canvas.height = 650;
        this.laneWidth = this.canvas.width / this.lanesCount;
    }

    getLaneCenterX(laneIndex) {
        return (laneIndex * this.laneWidth) + (this.laneWidth / 2);
    }

    loadHighScore() {
        this.highScore = parseInt(localStorage.getItem('r_racer_highscore')) || 0;
    }

    saveHighScore() {
        if (this.score > this.highScore) {
            this.highScore = Math.floor(this.score);
            localStorage.setItem('r_racer_highscore', this.highScore);
        }
    }

    bindInputEvents() {
        // Keyboard inputs listener execution
        window.addEventListener('keydown', (e) => {
            if (this.gameState !== 'RUNNING') {
                if (e.key === ' ' || e.key.toLowerCase() === 'r') {
                    if (this.gameState === 'START' || this.gameState === 'GAMEOVER') this.startGame();
                }
                if (e.key.toLowerCase() === 'p' && this.gameState === 'PAUSED') this.togglePause();
                return;
            }

            switch(e.key) {
                case 'ArrowLeft':
                case 'a':
                case 'A':
                    this.player.moveToLane(this.player.currentLane - 1);
                    break;
                case 'ArrowRight':
                case 'd':
                case 'D':
                    this.player.moveToLane(this.player.currentLane + 1);
                    break;
                case 'ArrowUp':
                case 'w':
                case 'W':
                    this.isBoosting = true;
                    break;
                case 'p':
                case 'P':
                    this.togglePause();
                    break;
            }
        });

        window.addEventListener('keyup', (e) => {
            if (['ArrowUp', 'w', 'W'].includes(e.key)) {
                this.isBoosting = false;
            }
        });

        // Interface Dom Elements Bindings execution
        document.getElementById('start-btn').addEventListener('click', () => this.startGame());
        document.getElementById('resume-btn').addEventListener('click', () => this.togglePause());
        document.getElementById('restart-btn').addEventListener('click', () => this.startGame());

        // Mobile Interfaces Click Events Binding execution
        const setupMobileBtn = (id, actionStart, actionEnd) => {
            const btn = document.getElementById(id);
            btn.addEventListener('touchstart', (e) => { e.preventDefault(); actionStart(); }, {passive: false});
            if (actionEnd) {
                btn.addEventListener('touchend', (e) => { e.preventDefault(); actionEnd(); }, {passive: false});
            }
        };

        setupMobileBtn('btn-left', () => this.player.moveToLane(this.player.currentLane - 1));
        setupMobileBtn('btn-right', () => this.player.moveToLane(this.player.currentLane + 1));
        setupMobileBtn('btn-nitro', () => { this.isBoosting = true; }, () => { this.isBoosting = false; });
    }

    startGame() {
        AudioEngine.init();
        this.enemies = [];
        this.score = 0;
        this.baseSpeed = 5;
        this.speedModifier = 0;
        this.spawnTimer = 0;
        this.isBoosting = false;
        this.player.resetPosition();
        this.gameState = 'RUNNING';
        this.updateUIOverlays();
    }

    togglePause() {
        if (this.gameState === 'RUNNING') {
            this.gameState = 'PAUSED';
        } else if (this.gameState === 'PAUSED') {
            AudioEngine.init();
            this.gameState = 'RUNNING';
        }
        this.updateUIOverlays();
    }

    gameOver() {
        this.gameState = 'GAMEOVER';
        this.isBoosting = false;
        AudioEngine.playCrash();
        this.saveHighScore();
        this.updateUIOverlays();
    }

    updateUIOverlays() {
        document.getElementById('start-screen').classList.toggle('active', this.gameState === 'START');
        document.getElementById('pause-screen').classList.toggle('active', this.gameState === 'PAUSED');
        document.getElementById('game-over-screen').classList.toggle('active', this.gameState === 'GAMEOVER');
        document.getElementById('hud').classList.toggle('hidden', this.gameState === 'START');
        
        if (this.gameState === 'GAMEOVER') {
            document.getElementById('final-score').innerText = Math.floor(this.score);
            document.getElementById('high-score').innerText = this.highScore;
        }
    }

    // Logic engine loop wrapper processing math computations matrix transforms ticks
    update() {
        if (this.gameState !== 'RUNNING') return;

        // Dynamic speed scale logic based on time elapsed/points earned
        this.speedModifier += 0.0007;
        const activeSpeed = (this.baseSpeed + this.speedModifier) * (this.isBoosting ? 1.8 : 1.0);

        // Update HUD Badge Style State
        const nitroBadge = document.getElementById('nitro-badge');
        if (this.isBoosting) {
            nitroBadge.innerText = "NITRO ACTIVE";
            nitroBadge.classList.add('active-boosting');
        } else {
            nitroBadge.innerText = "NITRO READY";
            nitroBadge.classList.remove('active-boosting');
        }

        // Advance scores relative to velocity matrixes context variables
        this.score += this.isBoosting ? 0.3 : 0.1;
        document.getElementById('score-display').innerText = Math.floor(this.score);

        // Advance background positioning tracker parameters loop offset bounds
        this.roadOffset += activeSpeed;
        if (this.roadOffset >= 60) this.roadOffset = 0;

        // Update Entity Objects
        this.player.update();

        // Spawn traffic algorithm procedural logic constraints
        this.spawnTimer++;
        if (this.spawnTimer >= Math.max(40, this.spawnInterval - Math.floor(this.speedModifier * 5))) {
            this.spawnTimer = 0;
            const randomLane = Math.floor(Math.random() * this.lanesCount);
            const randomColor = this.enemyColors[Math.floor(Math.random() * this.enemyColors.length)];
            // Variable individual speeds logic metrics constraints definitions
            const randomVarianceSpeed = Math.random() * 2 - 1; 
            
            this.enemies.push(new EnemyCar(this, randomLane, randomVarianceSpeed, randomColor));
        }

        // Manage array stack updates execution tracking indices removal 
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            this.enemies[i].update(activeSpeed * 0.4); // Moves down at fraction offset of perceived flow relative rate

            // Handle system points evaluation on safe pass triggers boundary triggers
            if (this.enemies[i].y > this.canvas.height) {
                this.enemies.splice(i, 1);
                AudioEngine.playScore();
                this.score += 10; // Bonus score for clean overtakes
                continue;
            }

            // Perform bounding AABB overlap tests evaluation conditional checks
            if (this.checkCollision(this.player, this.enemies[i])) {
                this.gameOver();
                break;
            }
        }
    }

    checkCollision(player, enemy) {
        const pBounds = {
            left: player.x + 4, // Intentionally shrink padding vectors hitboxes margin tolerance parameters 
            right: player.x + player.width - 4,
            top: player.y + 4,
            bottom: player.y + player.height - 4
        };
        const eBounds = enemy.getBounds();

        return !(pBounds.right < eBounds.left || 
                 pBounds.left > eBounds.right || 
                 pBounds.bottom < eBounds.top || 
                 pBounds.top > eBounds.bottom);
    }

    draw() {
        // Clear canvas context
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // 1. Draw Asphalt Ground Context Layer Base Paint
        this.ctx.fillStyle = '#12121f';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // 2. Draw Lane Striping markings patterns offset scrolling values mapping
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        this.ctx.lineWidth = 3;
        
        // Side borders glowing neon lanes boundaries configurations properties
        this.ctx.save();
        this.ctx.lineWidth = 4;
        this.ctx.shadowBlur = 8;
        this.ctx.shadowColor = '#9d4edd';
        this.ctx.strokeStyle = '#9d4edd';
        this.ctx.beginPath();
        this.ctx.moveTo(2, 0); this.ctx.lineTo(2, this.canvas.height);
        this.ctx.moveTo(this.canvas.width - 2, 0); this.ctx.lineTo(this.canvas.width - 2, this.canvas.height);
        this.ctx.stroke();
        this.ctx.restore();

        // Draw inner broken white divider strips
        this.ctx.save();
        this.ctx.setLineDash([30, 30]); // 30px dash length, 30px spacing matrix geometry mapping
        this.ctx.lineDashOffset = -this.roadOffset;
        
        this.ctx.beginPath();
        for (let i = 1; i < this.lanesCount; i++) {
            this.ctx.moveTo(i * this.laneWidth, 0);
            this.ctx.lineTo(i * this.laneWidth, this.canvas.height);
        }
        this.ctx.stroke();
        this.ctx.restore();

        // 3. Render Entities Layers Arrays Contexts Graphics
        this.enemies.forEach(enemy => enemy.draw(this.ctx));
        this.player.draw(this.ctx);
    }

    loop() {
        this.update();
        this.draw();
        requestAnimationFrame((timestamp) => this.loop(timestamp));
    }
}

// Instantiate App Launch Framework Window lifecycle load
window.addEventListener('DOMContentLoaded', () => {
    new Game();
});