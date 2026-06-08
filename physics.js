// SkyRoads 3D Kinematics & Physics Engine
import * as THREE from 'three';

// Road configuration constants
export const ROAD_WIDTH_LANES = 7;
export const TILE_WIDTH = 2.0;
export const TILE_LENGTH = 4.0;
export const TOTAL_ROAD_WIDTH = TILE_WIDTH * ROAD_WIDTH_LANES;

// Ship dimensions
export const SHIP_WIDTH = 0.6;
export const SHIP_HEIGHT = 0.4;
export const SHIP_LENGTH = 1.8;

export const CLASS_PRESETS = {
  fighter: {
    maxSpeedNormal: 35.0,
    maxSpeedBoost: 65.0,
    accelForward: 20.0,
    decelBrakes: 38.0,
    maxSteerSpeed: 11.0,
    steerAccel: 38.0,
    dragZ: 4.0,
    fuelConsumptionRate: 30.0
  },
  hauler: {
    maxSpeedNormal: 25.0,
    maxSpeedBoost: 50.0,
    accelForward: 12.0,
    decelBrakes: 30.0,
    maxSteerSpeed: 8.0,
    steerAccel: 28.0,
    dragZ: 5.0,
    fuelConsumptionRate: 40.0
  },
  scout: {
    maxSpeedNormal: 40.0,
    maxSpeedBoost: 75.0,
    accelForward: 15.0,
    decelBrakes: 35.0,
    maxSteerSpeed: 13.0,
    steerAccel: 42.0,
    dragZ: 3.5,
    fuelConsumptionRate: 15.0
  },
  dreadnought: {
    maxSpeedNormal: 28.0,
    maxSpeedBoost: 55.0,
    accelForward: 10.0,
    decelBrakes: 25.0,
    maxSteerSpeed: 7.0,
    steerAccel: 24.0,
    dragZ: 4.5,
    fuelConsumptionRate: 50.0
  },
  cruiser: {
    maxSpeedNormal: 32.0,
    maxSpeedBoost: 60.0,
    accelForward: 18.0,
    decelBrakes: 35.0,
    maxSteerSpeed: 10.0,
    steerAccel: 35.0,
    dragZ: 4.0,
    fuelConsumptionRate: 25.0
  },
  original: {
    maxSpeedNormal: 32.0,
    maxSpeedBoost: 60.0,
    accelForward: 18.0,
    decelBrakes: 35.0,
    maxSteerSpeed: 10.0,
    steerAccel: 35.0,
    dragZ: 4.0,
    fuelConsumptionRate: 25.0
  }
};

export class PhysicsEngine {
  constructor() {
    this.position = new THREE.Vector3(0, 0.2, 0); // Start at lane 3 (x=0), on the ground
    this.velocity = new THREE.Vector3(0, 0, 0);
    
    // Physics constants
    this.maxSpeedNormal = 32.0; // Z speed in units/s
    this.maxSpeedBoost = 60.0;
    this.maxSpeedSticky = 10.0;
    this.accelForward = 18.0;
    this.decelBrakes = 35.0;
    this.dragZ = 4.0;
    
    this.maxSteerSpeed = 10.0;
    this.steerAccel = 35.0;
    this.dragSteer = 28.0; // quick stabilization when keys released
    
    this.jumpImpulse = 10.5;
    
    // Engine states
    this.onGround = true;
    this.groundHeight = 0;
    this.isDead = false;
    this.deathReason = '';
    this.difficulty = 'hard';
    this.isTransitioning = false;
    this.health = 100.0;
    
    // Classic landing bounce (rebound) parameters
    this.isRebounding = false;
    this.reboundTimer = 0.0;
    this.justRebounded = false;
    
    // Active special behaviors
    this.activeEffects = {
      boost: false,
      superBoost: false,
      sticky: false,
      slippery: false,
      burning: false,
      highJump: false
    };
    
    this.oxygen = 100;
    this.fuel = 10000;
    this.fuelConsumptionRate = 25.0;

    this.settings = {
      bounceFactor: 1.0,
      gravityFactor: 1.0,
      jumpFactor: 1.0,
      fuelConsumptionRate: 25.0,
      damageModifier: 1.0,
      shipMass: 1.0,
      
      // Configurable Throttle
      maxSpeedNormal: 32.0,
      maxSpeedBoost: 60.0,
      accelForward: 18.0,
      decelBrakes: 35.0,
      dragZ: 4.0,

      // Configurable Handling
      maxSteerSpeed: 10.0,
      steerAccel: 35.0,
      dragSteer: 28.0,
      laneSnapStrength: 4.0,

      // Easy Mode Front Collision Rebounds
      easyCollisionBounceVel: 10.0,
      easyCollisionBounceDist: 1.2,

      // Jumping & Flight dynamics
      fallGravityMultiplier: 1.45,
      variableJumpDampening: 0.82,
      coyoteTimeBuffer: 0.25,

      // Configurable Cockpit Camera Offsets
      cockpitOffsetX: 0.0,
      cockpitOffsetY: 0.0,
      cockpitOffsetZ: 0.0,
      showCockpitBezel: 0.0
    };
    this.boatThrottleEnabled = false;
    
    if (typeof localStorage !== 'undefined') {
      const savedModel = localStorage.getItem('skyroads_selected_model');
      if (savedModel) {
        this.applyShipClass(savedModel);
      }
    }
  }

  reset(startFuel, startOxygen) {
    this.position.set(0, 0.2, 0);
    this.velocity.set(0, 0, 0);
    this.onGround = true;
    this.groundHeight = 0;
    this.isDead = false;
    this.deathReason = '';
    this.isTransitioning = false;
    this.isRebounding = false;
    this.reboundTimer = 0.0;
    this.justRebounded = false;
    this.fuel = startFuel * 50; // Map original DOS fuel scale
    this.oxygen = startOxygen;
    this.health = 100.0; // Initialize health to 100%
    
    this.activeEffects = {
      boost: false,
      superBoost: false,
      sticky: false,
      slippery: false,
      burning: false,
      highJump: false
    };

    this.triggerRefillAudio = false;
    this.triggerWallCollisionAudio = false;
    this.triggerLandingReboundAudio = false;
  }

  update(dt, keyboard, levelInfo) {
    if (this.isDead) return;
    dt = Math.min(dt, 0.05); // Cap timestep to prevent tunneling

    // Poll and update keyboard/gamepad combined state on every physics frame tick
    if (keyboard && typeof keyboard.updateCombinedState === 'function') {
      keyboard.updateCombinedState();
    }

    // Synchronize customizable settings properties with active instance variables
    this.maxSpeedNormal = this.settings.maxSpeedNormal !== undefined ? this.settings.maxSpeedNormal : 32.0;
    this.maxSpeedBoost = this.settings.maxSpeedBoost !== undefined ? this.settings.maxSpeedBoost : 60.0;
    this.accelForward = this.settings.accelForward !== undefined ? this.settings.accelForward : 18.0;
    this.decelBrakes = this.settings.decelBrakes !== undefined ? this.settings.decelBrakes : 35.0;
    this.dragZ = this.settings.dragZ !== undefined ? this.settings.dragZ : 4.0;
    this.maxSteerSpeed = this.settings.maxSteerSpeed !== undefined ? this.settings.maxSteerSpeed : 10.0;
    this.steerAccel = this.settings.steerAccel !== undefined ? this.settings.steerAccel : 35.0;
    this.dragSteer = this.settings.dragSteer !== undefined ? this.settings.dragSteer : 28.0;

    if (this.isTransitioning) {
      // Auto-pilot inside transition tube!
      this.velocity.x = 0;
      this.velocity.y = 0;
      this.velocity.z = -this.maxSpeedNormal; // Lock forward speed
      this.position.x = 0;
      this.position.y = 1.0; // Elevate slightly inside tube
      this.position.z += this.velocity.z * dt;
      this.onGround = true;
      this.groundHeight = 1.0;
      
      // Update engine states
      this.activeEffects = { boost: false, superBoost: false, sticky: false, slippery: false, burning: false, highJump: false };
      return;
    }

    // 1. Consume Fuel (only in hard difficulty) & Oxygen
    if (this.difficulty === 'hard') {
      if (Math.abs(this.velocity.z) > 0.5) {
        const rate = this.fuelConsumptionRate !== undefined ? this.fuelConsumptionRate : 25.0;
        this.fuel = Math.max(0, this.fuel - dt * rate * ((this.activeEffects.boost || this.activeEffects.superBoost) ? 2.5 : 1.0));
      }
    }
    this.oxygen = Math.max(0, this.oxygen - dt * 1.0); // 1 unit per second

    if (this.fuel <= 0) {
      this.isDead = true;
      this.deathReason = 'OUT OF FUEL';
      return;
    }
    if (this.difficulty !== 'hard' && this.health !== undefined && this.health <= 0) {
      this.isDead = true;
      this.deathReason = 'HULL FAILURE';
      return;
    }
    if (this.oxygen <= 0) {
      this.isDead = true;
      this.deathReason = 'OUT OF OXYGEN';
      return;
    }

    // 2. Resolve Effects from active special tiles
    this.resolveSpecialTiles(levelInfo.specialTiles);

    if (this.activeEffects.burning) {
      this.isDead = true;
      this.deathReason = 'BURNED TO CRIPPLES';
      return;
    }

    // 3. Forward Movement Acceleration / Drag
    //
    // Boost mechanics: boost tiles are CUMULATIVE with no top speed cap.
    // Each frame spent on a boost tile adds acceleration proportional to dt,
    // so longer contact = more speed gained. Speed persists after leaving
    // the tile — it only drops via natural drag, braking, or collisions.
    if (this.activeEffects.superBoost) {
      // Super boost: aggressive cumulative acceleration (no cap)
      this.velocity.z -= this.accelForward * 5.0 * dt;
    } else if (this.activeEffects.boost) {
      // Boost: cumulative acceleration (no cap)
      this.velocity.z -= this.accelForward * 2.5 * dt;
    } else if (this.activeEffects.sticky) {
      // Sticky aggressively decelerates toward sticky max speed
      if (Math.abs(this.velocity.z) > this.maxSpeedSticky) {
        this.velocity.z += this.decelBrakes * dt;
      }
    }

    // Process player forward controls (positive/negative Z)
    // Note: Z-axis is negative for forward movement
    // Manual acceleration is still capped at maxSpeedNormal to give boost tiles purpose
    if (keyboard.forward && !this.activeEffects.boost && !this.activeEffects.superBoost) {
      if (this.velocity.z > -this.maxSpeedNormal) {
        this.velocity.z -= this.accelForward * dt;
        // Only cap manual acceleration, not boost-accumulated speed
        if (this.velocity.z < -this.maxSpeedNormal) {
          this.velocity.z = -this.maxSpeedNormal;
        }
      }
    } else if (keyboard.backward) {
      if (this.velocity.z < 0) {
        this.velocity.z += this.decelBrakes * dt;
      }
    } else {
      // Natural rolling drag (only applies when not on boost and not pressing forward)
      if (!this.boatThrottleEnabled && !this.activeEffects.boost && !this.activeEffects.superBoost) {
        if (this.velocity.z < 0) {
          this.velocity.z += this.dragZ * dt;
          if (this.velocity.z > 0) this.velocity.z = 0;
        }
      }
    }

    // No global speed cap — boost is cumulative and uncapped.
    // Only sticky tiles enforce a speed limit (handled above).

    // 4. Steering (Left / Right along X axis)
    let steeringDrag = this.dragSteer;
    if (this.activeEffects.slippery) {
      steeringDrag = 1.0; // minimal friction, drift!
    }

    if (keyboard.mouseControlsEnabled || keyboard.touchControlsEnabled) {
      let steerVal = 0;
      let activeSteering = false;

      if (keyboard.steerAmount !== undefined && keyboard.steerAmount !== 0) {
        steerVal = keyboard.steerAmount;
        activeSteering = true;
      } else if (keyboard.left) {
        steerVal = -1;
        activeSteering = true;
      } else if (keyboard.right) {
        steerVal = 1;
        activeSteering = true;
      }

      // Smoothly interpolate (lerp) towards target analogue steer speed
      let targetSteerSpeed = steerVal * this.maxSteerSpeed;

      // Smart Lane Snapping/Magnetism:
      // Applies when using touch controls, the user is not actively steering (joystick is neutral/released),
      // the ship is on the ground, and it is not dead.
      if (keyboard.touchControlsEnabled && keyboard.laneSnapEnabled && !activeSteering && this.onGround && !this.isDead) {
        // Road is 7 lanes, TILE_WIDTH is 2.0. Lanes centered at -6, -4, -2, 0, 2, 4, 6.
        const nearestLaneX = Math.max(-6.0, Math.min(6.0, Math.round(this.position.x / 2.0) * 2.0));
        const distToLane = nearestLaneX - this.position.x;
        
        // Only pull if we are within a reasonable distance (e.g. less than 1.0 unit / half tile width)
        if (Math.abs(distToLane) < 1.0) {
          const snapStrength = (this.settings && this.settings.laneSnapStrength !== undefined) ? this.settings.laneSnapStrength : 4.0;
          targetSteerSpeed = distToLane * snapStrength;
        }
      }

      this.velocity.x += (targetSteerSpeed - this.velocity.x) * 15.0 * dt;
    } else {
      if (keyboard.left) {
        this.velocity.x -= this.steerAccel * dt;
        if (this.velocity.x < -this.maxSteerSpeed) this.velocity.x = -this.maxSteerSpeed;
      } else if (keyboard.right) {
        this.velocity.x += this.steerAccel * dt;
        if (this.velocity.x > this.maxSteerSpeed) this.velocity.x = this.maxSteerSpeed;
      } else {
        // Bring steering velocity back to 0
        if (this.velocity.x > 0) {
          this.velocity.x = Math.max(0, this.velocity.x - steeringDrag * dt);
        } else if (this.velocity.x < 0) {
          this.velocity.x = Math.min(0, this.velocity.x + steeringDrag * dt);
        }
      }
    }

    // Update active landing rebound state timer
    if (this.isRebounding) {
      this.reboundTimer -= dt;
      if (this.reboundTimer <= 0) {
        this.isRebounding = false;
      }
    }

    // 5. Jump & Gravity
    // Coyote time / Near-ground jump buffer (allows jumping when falling within 0.25 units of a valid ground block)
    // coyoteTimeBuffer setting defines the vertical near-ground distance threshold for jumping
    const isNearGround = this.velocity.y < 0 && this.groundHeight > -5.0 && (this.position.y - this.groundHeight) <= (this.settings.coyoteTimeBuffer !== undefined ? this.settings.coyoteTimeBuffer : 0.25);
    const wantsToJump = keyboard.jump || (keyboard.spacePressed !== undefined ? keyboard.spacePressed : false);
    if (wantsToJump && (this.onGround || this.isRebounding || isNearGround)) {
      this.velocity.y = this.jumpImpulse * (this.settings.jumpFactor !== undefined ? this.settings.jumpFactor : 1.0) * (this.activeEffects.highJump ? 1.7 : 1.0);
      this.onGround = false;
      this.isRebounding = false;
      this.justRebounded = false;
      keyboard.resetJump(); // Avoid double jumping immediately
    }

    if (!this.onGround) {
      let gravityForce = levelInfo.gravity * (this.settings.gravityFactor !== undefined ? this.settings.gravityFactor : 1.0);
      
      // If falling down, apply asymmetric falling gravity to make the jump snappy and less floaty
      if (this.velocity.y < 0) {
        gravityForce *= (this.settings.fallGravityMultiplier !== undefined ? this.settings.fallGravityMultiplier : 1.45);
      }

      if (this.velocity.y > 0) {
        const isSpaceHeld = keyboard.spacePressed !== undefined ? keyboard.spacePressed : true;
        if (!isSpaceHeld) {
          // Cut upward velocity (variable jump height)
          this.velocity.y *= (this.settings.variableJumpDampening !== undefined ? this.settings.variableJumpDampening : 0.82);
        }
      }
      // Pull ship down using level's specific gravity scale
      this.velocity.y -= gravityForce * dt;
    }

    // 6. Update Position
    this.position.x += this.velocity.x * dt;
    this.position.y += this.velocity.y * dt;
    this.position.z += this.velocity.z * dt;

    // 7. Ground Collisions and Bounding Boxes
    this.onGround = false;
    this.groundHeight = -10.0; // If you fall, you keep falling

    // Create ship bounding box
    let shipBox = this.getShipBox();

    // Check collisions with all level collidables
    for (const block of levelInfo.collidables) {
      if (block.isRamp) {
        // Calculate ramp height at current ship Z position
        const t = (this.position.z - block.maxZ) / (block.minZ - block.maxZ);
        const clampedT = Math.max(0, Math.min(1, t));
        const rampHeight = block.startY + clampedT * (block.endY - block.startY);

        const xOverlap = shipBox.maxX > block.minX && shipBox.minX < block.maxX;
        const zOverlap = shipBox.maxZ > block.minZ && shipBox.minZ < block.maxZ;

        if (xOverlap && zOverlap) {
          // 1. Frontal Collision (Crash) check
          // Only possible if the ship's center has not entered the ramp yet
          if (this.position.z > block.maxZ) {
            // Check if there is a connecting block preceding this ramp in collidables
            let isPrecededByConnecting = levelInfo.collidables.some(other => {
              const matchesZ = Math.abs(other.minZ - block.maxZ) < 0.05;
              const matchesX = shipBox.maxX > other.minX && shipBox.minX < other.maxX;
              if (matchesZ && matchesX) {
                const otherHeight = other.isRamp ? other.endY : (other.maxY || 0.0);
                return Math.abs(otherHeight - block.startY) < 0.05;
              }
              return false;
            });

            // Also check if the preceding tile is a standard flat road tile at 0.0
            if (!isPrecededByConnecting && Math.abs(block.startY) < 0.05) {
              const maxLeft = -TOTAL_ROAD_WIDTH / 2;
              const precedingZ = block.maxZ + 0.1; // point inside preceding row
              const rIdx = Math.floor(-precedingZ / TILE_LENGTH);
              const cIdx = Math.floor((this.position.x - maxLeft) / TILE_WIDTH);
              const originalLevelData = window.currentLevelData;
              if (originalLevelData && originalLevelData.rows[rIdx]) {
                const tile = originalLevelData.rows[rIdx][cIdx];
                if (tile !== null && !tile.full && !tile.half) {
                  const tileHeight = tile.ramp ? tile.endY : 0.0;
                  if (Math.abs(tileHeight - block.startY) < 0.05) {
                    isPrecededByConnecting = true;
                  }
                }
              }
            }

            const isBelowEntrance = this.position.y < block.startY - 0.15;
            if (isBelowEntrance && !isPrecededByConnecting) {
              if (this.difficulty === 'easy') {
                // Bounce back instead of dying!
                this.velocity.z = this.settings.easyCollisionBounceVel !== undefined ? this.settings.easyCollisionBounceVel : 10.0; // Positive Z is backward
                this.position.z += this.settings.easyCollisionBounceDist !== undefined ? this.settings.easyCollisionBounceDist : 1.2; // Push back to clear block bounding box
                this.triggerWallCollisionAudio = true; // Scrape/scrape wall audio as bounce indicator
                this.velocity.x = 0;
                
                // Update the ship's bounding box
                shipBox = this.getShipBox();
              } else if (this.difficulty === 'normal') {
                const shipMass = this.settings.shipMass !== undefined ? this.settings.shipMass : 1.0;
                const damageModifier = this.settings.damageModifier !== undefined ? this.settings.damageModifier : 1.0;
                const impactSpeed = Math.abs(this.velocity.z);
                const damage = impactSpeed * shipMass * damageModifier * 1.5;
                if (this.health > damage) {
                  this.health -= damage;
                  // Bounce back
                  this.velocity.z = this.settings.easyCollisionBounceVel !== undefined ? this.settings.easyCollisionBounceVel : 10.0;
                  this.position.z += this.settings.easyCollisionBounceDist !== undefined ? this.settings.easyCollisionBounceDist : 1.2;
                  this.triggerWallCollisionAudio = true;
                  this.velocity.x = 0;
                  shipBox = this.getShipBox();
                } else {
                  this.health = 0;
                  this.isDead = true;
                  this.deathReason = 'COLLIDED WITH BLOCK';
                  this.velocity.set(0, 0, 0);
                  return;
                }
              } else {
                this.isDead = true;
                this.deathReason = 'COLLIDED WITH BLOCK';
                this.velocity.set(0, 0, 0);
                return;
              }
            }
          }

          // 2. Side Collision Check
          // Only possible if ship's center is within the ramp's Z range
          let isSideHit = false;
          if (this.position.z <= block.maxZ && this.position.z >= block.minZ) {
            const blockCenterX = (block.minX + block.maxX) / 2;
            const isSideCollision = Math.abs(this.position.x - blockCenterX) > 0.35;

            if (isSideCollision && this.position.y < rampHeight - 0.1) {
              // Check if ship is currently riding an adjacent ramp of the same slope
              const isSteeringRight = this.position.x > blockCenterX;
              const isOnAdjacentRamp = levelInfo.collidables.some(other => 
                other.isRamp && 
                other !== block &&
                other.startY === block.startY && 
                other.endY === block.endY && 
                other.minZ === block.minZ && 
                other.maxZ === block.maxZ && 
                (isSteeringRight ? (Math.abs(other.minX - block.maxX) < 0.01) : (Math.abs(other.maxX - block.minX) < 0.01))
              );

              if (!isOnAdjacentRamp) {
                const halfW = SHIP_WIDTH / 2;
                if (this.position.x > blockCenterX) {
                  this.position.x = block.maxX + halfW + 0.01;
                } else {
                  this.position.x = block.minX - halfW - 0.01;
                }

                if (this.difficulty === 'normal') {
                  const shipMass = this.settings.shipMass !== undefined ? this.settings.shipMass : 1.0;
                  const damageModifier = this.settings.damageModifier !== undefined ? this.settings.damageModifier : 1.0;
                  const impactSpeed = Math.abs(this.velocity.x);
                  const damage = impactSpeed * shipMass * damageModifier * 1.5;
                  if (this.health > damage) {
                    this.health -= damage;
                  } else {
                    this.health = 0;
                    this.isDead = true;
                    this.deathReason = 'COLLIDED WITH BLOCK';
                    this.velocity.set(0, 0, 0);
                    return;
                  }
                }

                this.velocity.x = 0;
                this.triggerWallCollisionAudio = true;
                shipBox = this.getShipBox();
                isSideHit = true;
              }
            }
          }

          // 3. Riding / Snapping onto the ramp
          // Snap if we haven't hit the side and we are either on the ramp or transitioning off the top
          if (!isSideHit && this.position.z <= block.maxZ) {
            const isAboveRampSurface = this.position.y > rampHeight + 0.01;
            const isJumping = this.velocity.y > 0;
            
            // Snap to ramp if not climbing/flying above it
            if (!(isJumping && isAboveRampSurface)) {
              this.position.y = rampHeight;
              this.groundHeight = rampHeight;
              this.onGround = true;
              this.velocity.y = 0;
              shipBox = this.getShipBox();
            }
          }
        }
        continue; // Skip standard block collision checks for ramp blocks
      }

      // Check if Z and X intersect
      const xOverlap = shipBox.maxX > block.minX && shipBox.minX < block.maxX;
      const zOverlap = shipBox.maxZ > block.minZ && shipBox.minZ < block.maxZ;

      if (xOverlap && zOverlap) {
        // Handle ceiling collision bump
        if (block.isCeiling) {
          const verticalOverlap = shipBox.maxY > block.minY && shipBox.minY < block.maxY;
          if (verticalOverlap && this.velocity.y > 0) {
            this.position.y = block.minY - SHIP_HEIGHT - 0.01;
            this.velocity.y = 0;
            shipBox = this.getShipBox();
          }
          // Note: we skip standard obstacle checks for ceiling blocks,
          // but flow through to the landing checks below
        } else if (block.isObstacle) {
          // If Y overlap exists, check for horizontal collision
          const isBelowTop = shipBox.minY < block.maxY - 0.15;
          const isAboveBottom = shipBox.maxY > block.minY;

          if (isBelowTop && isAboveBottom) {
            // Calculate overlap depths in X and Z
            const overlapZ = Math.min(shipBox.maxZ, block.maxZ) - Math.max(shipBox.minZ, block.minZ);
            const overlapX = Math.min(shipBox.maxX, block.maxX) - Math.max(shipBox.minX, block.minX);

            // A side collision occurs if the back of the ship has already crossed the front of the block,
            // OR if the horizontal overlap is shallow while the vertical longitudinal overlap is deep.
            const isSideCollision = (shipBox.maxZ <= block.maxZ + 0.15) || (overlapX < 0.35 && overlapZ > 0.5);

            if (!isSideCollision) {
              const isPrecededByRamp = levelInfo.collidables.some(other => 
                other.isRamp && 
                Math.abs(other.minZ - block.maxZ) < 0.1 &&
                this.position.x >= other.minX - 0.2 && this.position.x <= other.maxX + 0.2
              );
              const isOnRamp = isPrecededByRamp && 
                this.position.z >= block.maxZ - 0.5 && this.position.z <= block.maxZ + TILE_LENGTH + 0.1;

              if (!isOnRamp) {
                if (this.difficulty === 'easy') {
                  // Bounce back instead of dying!
                  this.velocity.z = this.settings.easyCollisionBounceVel !== undefined ? this.settings.easyCollisionBounceVel : 10.0; // Positive Z is backward
                  this.position.z += this.settings.easyCollisionBounceDist !== undefined ? this.settings.easyCollisionBounceDist : 1.2; // Push back to clear block bounding box
                  this.triggerWallCollisionAudio = true; // Scrape/scrape wall audio as bounce indicator
                  this.velocity.x = 0;
                  
                  // Update the ship's bounding box
                  shipBox = this.getShipBox();
                } else if (this.difficulty === 'normal') {
                  const shipMass = this.settings.shipMass !== undefined ? this.settings.shipMass : 1.0;
                  const damageModifier = this.settings.damageModifier !== undefined ? this.settings.damageModifier : 1.0;
                  const impactSpeed = Math.abs(this.velocity.z);
                  const damage = impactSpeed * shipMass * damageModifier * 1.5;
                  if (this.health > damage) {
                    this.health -= damage;
                    // Bounce back
                    this.velocity.z = this.settings.easyCollisionBounceVel !== undefined ? this.settings.easyCollisionBounceVel : 10.0;
                    this.position.z += this.settings.easyCollisionBounceDist !== undefined ? this.settings.easyCollisionBounceDist : 1.2;
                    this.triggerWallCollisionAudio = true;
                    this.velocity.x = 0;
                    shipBox = this.getShipBox();
                  } else {
                    this.health = 0;
                    this.isDead = true;
                    this.deathReason = 'COLLIDED WITH BLOCK';
                    this.velocity.set(0, 0, 0);
                    return;
                  }
                } else {
                  // Front collision -> Crash!
                  this.isDead = true;
                  this.deathReason = 'COLLIDED WITH BLOCK';
                  this.velocity.set(0, 0, 0);
                  return;
                }
              }
            } else {
              // Side wall collision -> Push ship out of the block and slide!
              const halfW = SHIP_WIDTH / 2;
              const shipCenterX = this.position.x;
              const blockCenterX = (block.minX + block.maxX) / 2;

              if (shipCenterX > blockCenterX) {
                // Push to the right of the block
                this.position.x = block.maxX + halfW + 0.01;
              } else {
                // Push to the left of the block
                this.position.x = block.minX - halfW - 0.01;
              }

              if (this.difficulty === 'normal') {
                const shipMass = this.settings.shipMass !== undefined ? this.settings.shipMass : 1.0;
                const damageModifier = this.settings.damageModifier !== undefined ? this.settings.damageModifier : 1.0;
                const impactSpeed = Math.abs(this.velocity.x);
                const damage = impactSpeed * shipMass * damageModifier * 1.5;
                if (this.health > damage) {
                  this.health -= damage;
                } else {
                  this.health = 0;
                  this.isDead = true;
                  this.deathReason = 'COLLIDED WITH BLOCK';
                  this.velocity.set(0, 0, 0);
                  return;
                }
              }

              // Stop lateral steering velocity
              this.velocity.x = 0;

              // Trigger side scrape sound!
              this.triggerWallCollisionAudio = true;

              // Update the ship's bounding box for subsequent collision checks in this frame
              shipBox = this.getShipBox();
            }
          }
        }

        // Check if we are landing on top of the tile
        const fallingDown = this.velocity.y <= 0;
        const aboveBlockTop = shipBox.minY >= block.maxY - 0.25 && shipBox.minY <= block.maxY + 0.15;

        if (fallingDown && aboveBlockTop) {
          this.position.y = block.maxY;
          this.groundHeight = block.maxY;

          const isJumpHeld = keyboard.spacePressed !== undefined ? keyboard.spacePressed : false;
          if (this.velocity.y < -3.0 && !isJumpHeld && !this.justRebounded) {
            this.isRebounding = true;
            this.reboundTimer = 0.12;
            this.velocity.y = 4.2 * (this.settings.bounceFactor !== undefined ? this.settings.bounceFactor : 1.0); // Classic bounce upwards
            this.onGround = false;
            this.justRebounded = true;
            this.triggerLandingReboundAudio = true;
          } else {
            this.onGround = true;
            this.velocity.y = 0;
            this.justRebounded = false;
          }
          shipBox = this.getShipBox();
        }
      }
    }

    // Handle standard ground level (y=0) check across active track zones
    const absoluteZ = -this.position.z;
    if (absoluteZ >= 0 && absoluteZ <= levelInfo.trackLength) {
      // Check if we are inside the track width
      const maxLeft = -TOTAL_ROAD_WIDTH / 2;
      const maxRight = TOTAL_ROAD_WIDTH / 2;
      const withinTrackWidth = this.position.x >= maxLeft && this.position.x <= maxRight;

      // Check if we landed on standard flat ground.
      // Only snap when ship is CLOSE to ground level (within 0.5 units),
      // not when it has already fallen deep below the road.
      if (withinTrackWidth && !this.onGround && this.velocity.y <= 0.0 && this.position.y <= 0.0 && this.position.y > -0.5) {
        // Verify we aren't falling through a gap in the road
        const tileExists = this.checkTileExists(this.position.x, this.position.z);
        if (tileExists) {
          this.position.y = 0.0;
          this.groundHeight = 0.0;

          const isJumpHeld = keyboard.spacePressed !== undefined ? keyboard.spacePressed : false;
          if (this.velocity.y < -3.0 && !isJumpHeld && !this.justRebounded) {
            this.isRebounding = true;
            this.reboundTimer = 0.12;
            this.velocity.y = 4.2 * (this.settings.bounceFactor !== undefined ? this.settings.bounceFactor : 1.0); // Classic bounce upwards
            this.onGround = false;
            this.justRebounded = true;
            this.triggerLandingReboundAudio = true;
          } else {
            this.onGround = true;
            this.velocity.y = 0.0;
            this.justRebounded = false;
          }
        }
      }
    }

    // 8. Fall out of track detection
    if (this.position.y < -4.0) {
      this.isDead = true;
      this.deathReason = 'FELL OFF ROAD';
      this.velocity.set(0, -15, 0);
    }
  }

  // Check if a tile exists at specific world coordinates on the track
  checkTileExists(x, z) {
    const maxLeft = -TOTAL_ROAD_WIDTH / 2;
    const absZ = -z;
    const rIdx = Math.floor(absZ / TILE_LENGTH);
    const cIdx = Math.floor((x - maxLeft) / TILE_WIDTH);

    // If out of bounds of track, no tile
    if (rIdx < 0 || cIdx < 0 || cIdx >= ROAD_WIDTH_LANES) return false;

    // Check the original level row data via window global
    const originalLevelData = window.currentLevelData;
    if (originalLevelData && originalLevelData.rows[rIdx]) {
      const tile = originalLevelData.rows[rIdx][cIdx];
      return tile !== null;
    }
    return true; // Fallback: assume tile exists if data unavailable
  }

  // Ship bounding box
  getShipBox() {
    const halfW = SHIP_WIDTH / 2;
    const halfH = SHIP_HEIGHT / 2;
    const halfL = SHIP_LENGTH / 2;
    return {
      minX: this.position.x - halfW,
      maxX: this.position.x + halfW,
      minY: this.position.y,
      maxY: this.position.y + SHIP_HEIGHT,
      minZ: this.position.z - halfL,
      maxZ: this.position.z + halfL
    };
  }

  // Detect and resolve special tiles (boost, supplies, slippery, sticky, burning)
  resolveSpecialTiles(specialTiles) {
    const shipBox = this.getShipBox();

    // Reset temporary tile effects (they only last while touching!)
    this.activeEffects.boost = false;
    this.activeEffects.superBoost = false;
    this.activeEffects.sticky = false;
    this.activeEffects.slippery = false;
    this.activeEffects.burning = false;
    this.activeEffects.highJump = false;

    for (const tile of specialTiles) {
      const box = tile.boundingBox;
      const xOverlap = shipBox.maxX > box.minX && shipBox.minX < box.maxX;
      const yOverlap = shipBox.minY <= box.maxY && shipBox.maxY >= box.minY;
      const zOverlap = shipBox.maxZ > box.minZ && shipBox.minZ < box.maxZ;

      if (xOverlap && yOverlap && zOverlap) {
        const behavior = tile.behavior;
        if (behavior === 'boost') {
          this.activeEffects.boost = true;
        } else if (behavior === 'super_boost') {
          this.activeEffects.superBoost = true;
        } else if (behavior === 'sticky') {
          this.activeEffects.sticky = true;
        } else if (behavior === 'slippery') {
          this.activeEffects.slippery = true;
        } else if (behavior === 'burning') {
          this.activeEffects.burning = true;
        } else if (behavior === 'high_jump') {
          this.activeEffects.highJump = true;
        } else if (behavior === 'refill') {
          // Refills occur instantaneously, restoring health, adding fuel, and resetting oxygen to max
          if (this.fuel < 100 * 50) {
            this.fuel = Math.min(100 * 50, this.fuel + 1000);
          }
          this.oxygen = 100;
          this.health = 100.0;
          
          // Trigger a sound chime (we set a flag to notify app.js)
          this.triggerRefillAudio = true;
        }
      }
    }
  }

  applyShipClass(className) {
    const LEGACY_MODEL_ALIASES = {
      corvette1: 'fighter',
      ship1: 'fighter',
      ship2: 'fighter',
      
      corvette2: 'scout',
      corvette4: 'scout',
      frigate4: 'scout',
      
      corvette3: 'cruiser',
      frigate2: 'cruiser',
      frigate3: 'cruiser',
      ship3: 'cruiser',
      
      corvette5: 'hauler',
      frigate1: 'hauler',
      ship4: 'hauler',
      
      frigate5: 'dreadnought',
      ship5: 'dreadnought'
    };
    const mappedClass = LEGACY_MODEL_ALIASES[className] || className;
    this.shipClass = mappedClass;
    const stats = CLASS_PRESETS[mappedClass] || CLASS_PRESETS.original;
    this.fuelConsumptionRate = stats.fuelConsumptionRate || 25.0;
    
    for (const key in stats) {
      this.settings[key] = stats[key];
      if (this[key] !== undefined) {
        this[key] = stats[key];
      }
    }
    
    if (typeof localStorage !== 'undefined') {
      const activePreset = localStorage.getItem('skyroads_physics_active_preset') || 'snappy';
      const presetKey = `skyroads_physics_preset_${activePreset}`;
      let presetData = {};
      try {
        const saved = localStorage.getItem(presetKey);
        if (saved) {
          presetData = JSON.parse(saved);
        }
      } catch (e) {
        // ignore
      }
      
      for (const key in stats) {
        presetData[key] = stats[key];
      }
      
      localStorage.setItem(presetKey, JSON.stringify(presetData));
      localStorage.setItem('skyroads_selected_model', className);
    }
  }
}

// Simple Keyboard controller class with optional mouse play support
export class KeyboardController {
  constructor() {
    this.forward = false;
    this.backward = false;
    this.left = false;
    this.right = false;
    this.jump = false;
    this.rewind = false;
    this.spacePressed = false;
    this.steerAmount = 0; // Proportional steer amount (-1 to 1) like an analogue stick

    this.touch = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      jump: false,
      rewind: false
    };

    // Separate keyboard and mouse state tracking to allow seamless combinations
    this.keys = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      jump: false,
      rewind: false
    };

    this.mouse = {
      forward: false,
      left: false,
      right: false,
      jump: false
    };

    this.mouseControlsEnabled = false;
    this.touchControlsEnabled = false;
    this.touchJoystickThrottleEnabled = false;
    this.laneSnapEnabled = true;

    this.gamepadConnected = false;
    this.gamepad = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      jump: false,
      rewind: false,
      steerAmount: 0,
      cycleCameraPressed: false,
      togglePausePressed: false,
      menuUp: false,
      menuDown: false,
      menuLeft: false,
      menuRight: false,
      menuSelect: false,
      menuCancel: false
    };

    this.gamepadMappings = {
      forward: 7,       // RT (Right Trigger)
      backward: 6,      // LT (Left Trigger)
      jump: 0,          // A button
      left: 14,         // D-pad Left
      right: 15,        // D-pad Right
      rewind: 2,        // X button
      cycleCamera: 3,   // Y button
      togglePause: 9    // Start button
    };

    this.prevGamepadButtons = {};
    this.prevMenuDirections = {
      up: false,
      down: false,
      left: false,
      right: false
    };
    this.currentlyMappingAction = null;
    this.onGamepadMapComplete = null;

    this.loadGamepadMappings();

    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', (e) => this.handleKey(e, true));
      window.addEventListener('keyup', (e) => this.handleKey(e, false));

      window.addEventListener('mousedown', (e) => this.handleMouseDown(e));
      window.addEventListener('mouseup', (e) => this.handleMouseUp(e));
      window.addEventListener('mousemove', (e) => this.handleMouseMove(e));
      window.addEventListener('contextmenu', (e) => {
        if (this.mouseControlsEnabled) {
          e.preventDefault();
        }
      });

      window.addEventListener('gamepadconnected', () => {
        this.gamepadConnected = true;
      });
      window.addEventListener('gamepaddisconnected', () => {
        this.gamepadConnected = false;
      });
    }
  }

  handleKey(e, isDown) {
    const code = e.code;
    if (code === 'ArrowUp' || code === 'KeyW') this.keys.forward = isDown;
    if (code === 'ArrowDown' || code === 'KeyS') this.keys.backward = isDown;
    if (code === 'ArrowLeft' || code === 'KeyA') this.keys.left = isDown;
    if (code === 'ArrowRight' || code === 'KeyD') this.keys.right = isDown;
    if (code === 'Space') {
      this.keys.jump = isDown;
    }
    if (code === 'KeyR') {
      this.keys.rewind = isDown;
    }
    this.updateCombinedState();
  }

  handleMouseDown(e) {
    if (!this.mouseControlsEnabled) return;
    if (e.button === 0) { // Left Click -> Jump
      this.mouse.jump = true;
    } else if (e.button === 2) { // Right Click -> Accelerate
      this.mouse.forward = true;
    }
    this.updateCombinedState();
  }

  handleMouseUp(e) {
    if (!this.mouseControlsEnabled) return;
    if (e.button === 0) {
      this.mouse.jump = false;
    } else if (e.button === 2) {
      this.mouse.forward = false;
    }
    this.updateCombinedState();
  }

  handleMouseMove(e) {
    if (!this.mouseControlsEnabled) {
      this.mouse.left = false;
      this.mouse.right = false;
      this.steerAmount = 0;
      this.updateCombinedState();
      return;
    }
    // Proportional analogue-style steering with central deadzone
    const centerX = window.innerWidth / 2;
    const diff = e.clientX - centerX;
    const deadzone = window.innerWidth * 0.05; // Tight, premium 5% deadzone
    const maxRange = window.innerWidth * 0.40; // Full steering achieved at 40% width from center

    if (Math.abs(diff) < deadzone) {
      this.steerAmount = 0;
      this.mouse.left = false;
      this.mouse.right = false;
    } else {
      const sign = diff < 0 ? -1 : 1;
      const val = (Math.abs(diff) - deadzone) / (maxRange - deadzone);
      this.steerAmount = Math.max(-1, Math.min(1, val * sign));
      this.mouse.left = this.steerAmount < 0;
      this.mouse.right = this.steerAmount > 0;
    }
    this.updateCombinedState();
  }

  setTouchState(action, active) {
    if (this.touch[action] !== undefined) {
      this.touch[action] = active;
    }
    this.updateCombinedState();
  }

  setTouchSteerAmount(amount) {
    this.steerAmount = amount;
    if (amount < 0) {
      this.touch.left = true;
      this.touch.right = false;
    } else if (amount > 0) {
      this.touch.left = false;
      this.touch.right = true;
    } else {
      this.touch.left = false;
      this.touch.right = false;
    }
    this.updateCombinedState();
  }

  setTouchJoystickY(yAmount) {
    if (!this.touchJoystickThrottleEnabled) {
      this.touch.forward = false;
      this.touch.backward = false;
      return;
    }
    // yAmount ranges from -1 (top/forward) to 1 (bottom/backward)
    if (yAmount < -0.2) {
      this.touch.forward = true;
      this.touch.backward = false;
    } else if (yAmount > 0.2) {
      this.touch.forward = false;
      this.touch.backward = true;
    } else {
      this.touch.forward = false;
      this.touch.backward = false;
    }
    this.updateCombinedState();
  }

  updateCombinedState() {
    this.pollGamepad();

    this.forward = this.keys.forward || (this.mouseControlsEnabled && this.mouse.forward) || (this.touchControlsEnabled && this.touch.forward) || this.gamepad.forward;
    this.backward = this.keys.backward || (this.touchControlsEnabled && this.touch.backward) || this.gamepad.backward;
    this.left = this.keys.left || (this.mouseControlsEnabled && this.mouse.left) || (this.touchControlsEnabled && this.touch.left) || this.gamepad.left;
    this.right = this.keys.right || (this.mouseControlsEnabled && this.mouse.right) || (this.touchControlsEnabled && this.touch.right) || this.gamepad.right;
    this.jump = this.keys.jump || (this.mouseControlsEnabled && this.mouse.jump) || (this.touchControlsEnabled && this.touch.jump) || this.gamepad.jump;
    this.rewind = this.keys.rewind || (this.touchControlsEnabled && this.touch.rewind) || this.gamepad.rewind;
    this.spacePressed = this.keys.jump || (this.mouseControlsEnabled && this.mouse.jump) || (this.touchControlsEnabled && this.touch.jump) || this.gamepad.jump;

    // Steer Amount: prioritize analog gamepad stick, then touch/mouse steer amount
    if (this.gamepadConnected && this.gamepad.steerAmount !== 0) {
      this.steerAmount = this.gamepad.steerAmount;
    } else if (this.mouseControlsEnabled || this.touchControlsEnabled) {
      // Keep mouse/touch steerAmount if active
    } else {
      this.steerAmount = 0;
    }
  }

  loadGamepadMappings() {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('skyroads_gamepad_mappings');
      if (saved) {
        try {
          this.gamepadMappings = { ...this.gamepadMappings, ...JSON.parse(saved) };
        } catch (e) {
          // Fallback to default
        }
      }
    }
  }

  saveGamepadMappings() {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('skyroads_gamepad_mappings', JSON.stringify(this.gamepadMappings));
    }
  }

  _isGamepadPressed(gp, btnIndex) {
    if (btnIndex === null || btnIndex === undefined) return false;
    const btn = gp.buttons[btnIndex];
    return btn ? btn.pressed : false;
  }

  _detectGamepadJustPressed(gp, btnIndex, actionKey) {
    if (btnIndex === null || btnIndex === undefined) return false;
    const btn = gp.buttons[btnIndex];
    const pressed = btn ? btn.pressed : false;
    const prevPressed = this.prevGamepadButtons[actionKey] || false;
    this.prevGamepadButtons[actionKey] = pressed;
    return pressed && !prevPressed;
  }

  _detectMenuDirectionPress(dirKey, isPressedNow) {
    const prevPressed = this.prevMenuDirections[dirKey] || false;
    this.prevMenuDirections[dirKey] = isPressedNow;
    return isPressedNow && !prevPressed;
  }

  pollGamepad() {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) {
      this.gamepadConnected = false;
      return;
    }

    const gamepads = navigator.getGamepads();
    let gp = null;
    for (let i = 0; i < gamepads.length; i++) {
      if (gamepads[i]) {
        gp = gamepads[i];
        break;
      }
    }

    if (!gp) {
      this.gamepadConnected = false;
      this.gamepad.forward = false;
      this.gamepad.backward = false;
      this.gamepad.left = false;
      this.gamepad.right = false;
      this.gamepad.jump = false;
      this.gamepad.rewind = false;
      this.gamepad.steerAmount = 0;
      this.gamepad.cycleCameraPressed = false;
      this.gamepad.togglePausePressed = false;
      this.gamepad.menuUp = false;
      this.gamepad.menuDown = false;
      this.gamepad.menuLeft = false;
      this.gamepad.menuRight = false;
      this.gamepad.menuSelect = false;
      this.gamepad.menuCancel = false;
      this.prevMenuDirections.up = false;
      this.prevMenuDirections.down = false;
      this.prevMenuDirections.left = false;
      this.prevMenuDirections.right = false;
      return;
    }

    this.gamepadConnected = true;

    // If currently mapping a button, listen for any pressed button
    if (this.currentlyMappingAction) {
      for (let b = 0; b < gp.buttons.length; b++) {
        if (gp.buttons[b].pressed) {
          const action = this.currentlyMappingAction;
          this.gamepadMappings[action] = b;
          this.saveGamepadMappings();
          this.currentlyMappingAction = null;
          
          if (typeof this.onGamepadMapComplete === 'function') {
            this.onGamepadMapComplete(action, b);
          }
          break;
        }
      }
      return;
    }

    // Read action states
    this.gamepad.forward = this._isGamepadPressed(gp, this.gamepadMappings.forward);
    this.gamepad.backward = this._isGamepadPressed(gp, this.gamepadMappings.backward);
    this.gamepad.jump = this._isGamepadPressed(gp, this.gamepadMappings.jump);
    this.gamepad.rewind = this._isGamepadPressed(gp, this.gamepadMappings.rewind);

    const steerLeftVal = this._isGamepadPressed(gp, this.gamepadMappings.left);
    const steerRightVal = this._isGamepadPressed(gp, this.gamepadMappings.right);

    // Left stick X axis analog steering
    if (gp.axes && gp.axes.length > 0) {
      const steerAxis = gp.axes[0];
      const deadzone = 0.15;
      if (Math.abs(steerAxis) > deadzone) {
        this.gamepad.steerAmount = steerAxis;
        this.gamepad.left = steerAxis < 0;
        this.gamepad.right = steerAxis > 0;
      } else {
        this.gamepad.steerAmount = 0;
        this.gamepad.left = steerLeftVal;
        this.gamepad.right = steerRightVal;
      }
    } else {
      this.gamepad.steerAmount = 0;
      this.gamepad.left = steerLeftVal;
      this.gamepad.right = steerRightVal;
    }

    this.gamepad.cycleCameraPressed = this._detectGamepadJustPressed(gp, this.gamepadMappings.cycleCamera, 'cycleCamera');
    this.gamepad.togglePausePressed = this._detectGamepadJustPressed(gp, this.gamepadMappings.togglePause, 'togglePause');

    // Menu Navigation Directions & Buttons
    let stickUp = false;
    let stickDown = false;
    let stickLeft = false;
    let stickRight = false;

    if (gp.axes && gp.axes.length > 1) {
      const stickX = gp.axes[0];
      const stickY = gp.axes[1];
      const stickThreshold = 0.5;
      
      stickUp = stickY < -stickThreshold;
      stickDown = stickY > stickThreshold;
      stickLeft = stickX < -stickThreshold;
      stickRight = stickX > stickThreshold;
    }

    // Combined menu directions (D-pad or Left Stick)
    const dirUp = this._isGamepadPressed(gp, 12) || stickUp;
    const dirDown = this._isGamepadPressed(gp, 13) || stickDown;
    const dirLeft = this._isGamepadPressed(gp, 14) || stickLeft;
    const dirRight = this._isGamepadPressed(gp, 15) || stickRight;

    this.gamepad.menuUp = this._detectMenuDirectionPress('up', dirUp);
    this.gamepad.menuDown = this._detectMenuDirectionPress('down', dirDown);
    this.gamepad.menuLeft = this._detectMenuDirectionPress('left', dirLeft);
    this.gamepad.menuRight = this._detectMenuDirectionPress('right', dirRight);

    // Menu Select (A button) & Cancel (B button) transitions
    this.gamepad.menuSelect = this._detectGamepadJustPressed(gp, 0, 'menuSelect');
    this.gamepad.menuCancel = this._detectGamepadJustPressed(gp, 1, 'menuCancel');
  }

  consumeCycleCamera() {
    if (this.gamepad.cycleCameraPressed) {
      this.gamepad.cycleCameraPressed = false;
      return true;
    }
    return false;
  }

  consumeTogglePause() {
    if (this.gamepad.togglePausePressed) {
      this.gamepad.togglePausePressed = false;
      return true;
    }
    return false;
  }

  resetJump() {
    this.jump = false;
  }
}

