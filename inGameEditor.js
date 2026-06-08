import * as THREE from 'three';
import { buildLevelAsync, disposeUnusedThemes, getActiveThemeIndex, TILE_WIDTH, TILE_LENGTH } from './levelLoader.js';

// Default VGA 16-color palette presets based on classic SkyRoads levels
const PALETTE_HEX = {
  0: '#000000', 1: '#0000aa', 2: '#00aa00', 3: '#00aaaa',
  4: '#aa0000', 5: '#aa00aa', 6: '#aa5500', 7: '#aaaaaa',
  8: '#555555', 9: '#5555ff', 10: '#55ff55', 11: '#55ffff',
  12: '#ff5555', 13: '#ff55ff', 14: '#ffff55', 15: '#ffffff'
};

const DEFAULT_PALETTES = [
  [0, 0, 0], [40, 97, 109], [0, 141, 0], [48, 60, 56],
  [121, 137, 121], [101, 121, 141], [109, 109, 101], [125, 153, 109],
  [80, 80, 80], [68, 68, 214], [68, 214, 68], [202, 202, 202],
  [214, 68, 68], [255, 153, 226], [80, 161, 161], [214, 214, 214]
];

/**
 * Deep clones any JSON-serializable object to enforce immutability.
 */
function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Represents a command in the editor undo/redo history.
 */
class EditorCommand {
  constructor(executeFn, undoFn, description) {
    this.executeFn = executeFn;
    this.undoFn = undoFn;
    this.description = description;
  }
  execute() { this.executeFn(); }
  undo() { this.undoFn(); }
  toString() { return this.description; }
}

export class InGameEditor {
  constructor(app) {
    this.app = app;
    this.graphics = app.graphics;
    this.active = false;
    
    // Flying Camera state
    this.cameraYaw = 0;
    this.cameraPitch = 0;
    this.cameraPosition = new THREE.Vector3(0, 5, 10);
    this.flySpeed = 25.0;
    this.mouseSensitivity = 0.002;
    this.pointerLocked = false;
    
    this.keyboardState = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      up: false,
      down: false,
      shift: false
    };

    // Mouse paint drag state
    this.mouseState = {
      left: false,
      right: false
    };
    this.lastPaintedCoord = null; // { lane, row, height }

    // Editor settings & grid modifications state
    this.levelDraft = null; // Unpacked version of level
    this.activeBrush = 'road'; // 'road', 'obstacle-half', 'obstacle-full', 'tunnel', 'ramp'
    this.activeColorIdx = 11; // cyan / boost tag default
    this.activePlaneHeight = 0; // locked height when holding shift
    
    // Undo/Redo queues
    this.history = [];
    this.redoStack = [];
    
    // Raycasting & Hover guide
    this.hoverCoord = null; // { lane, row, height }
    this.hoverBox = null;
    this.gridLines = null;
    this.raycaster = new THREE.Raycaster();
    this.mouse2D = new THREE.Vector2(0, 0); // screen center during pointer lock
    
    // UI Panel visible status
    this.uiCollapsed = false;
  }

  /**
   * Activate the in-game editor: freeze physics, hide ship, set up fly cam.
   */
  activate() {
    if (this.active) return;
    this.active = true;
    
    // 1. Save original game state & pause active physics
    this.app.gameState = 'editor';
    if (window.gameAudio) {
      window.gameAudio.stopEngine();
    }
    
    // Hide cockpit HUD overlay and mobile controls
    const hud = document.getElementById('hud');
    if (hud) hud.classList.add('hidden');
    if (this.app.touchManager) this.app.touchManager.hide();
    
    // Hide standard in-game pause button
    const btnInGamePause = document.getElementById('btn-in-game-pause');
    if (btnInGamePause) btnInGamePause.classList.add('hidden');

    // 2. Hide player hovercraft ship visual meshes & thrusters
    if (this.graphics.shipMesh) {
      this.graphics.shipMesh.visible = false;
    }
    if (this.graphics.particles) {
      this.graphics.particles.forEach(p => {
        this.graphics.scene.remove(p.mesh);
      });
      this.graphics.particles = [];
    }

    // 3. Initialize Flying Camera position behind the ship's current position
    const shipPos = this.app.physics.position;
    this.cameraPosition.set(shipPos.x, shipPos.y + 3, shipPos.z + 8);
    this.cameraYaw = Math.PI; // facing forward along negative Z
    this.cameraPitch = -0.2; // looking slightly downward
    this.graphics.camera.rotation.order = 'YXZ';
    this.updateCameraTransform();

    // 4. Unpack the current active cooked level data into editor draft format in-memory
    this.unpackCurrentLevel();

    // 5. Create hover guides and 3D wireframe grid outlines
    this.createHoverGuides();
    this.rebuildHelperGrid();

    // 6. Set up event listeners
    this.setupListeners();

    // 7. Inject Editor HTML HUD layout dynamically
    this.injectEditorUI();
    this.syncPropertiesPanel();

    this.showStatusMessage("Level Editor Mode Activated. Click viewport to steer camera.");
  }

  /**
   * Deactivate and return to standard gameplay, saving changes dynamically.
   */
  deactivate(saveChanges = true) {
    if (!this.active) return;
    this.active = false;
    
    // 1. Remove event listeners & release pointer lock
    this.cleanupListeners();
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }

    // 2. Clear editor meshes
    if (this.hoverBox) {
      this.graphics.scene.remove(this.hoverBox);
      if (this.hoverBox.geometry) this.hoverBox.geometry.dispose();
      if (this.hoverBox.material) this.hoverBox.material.dispose();
      this.hoverBox = null;
    }
    if (this.gridLines) {
      this.graphics.scene.remove(this.gridLines);
      this.gridLines = null;
    }

    // 3. Remove injected HTML overlays
    const overlays = ['editor-top-bar', 'editor-left-toolbar', 'editor-right-properties', 'editor-crosshair'];
    overlays.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.remove();
    });

    // 4. Save browser overrides if requested
    if (saveChanges && this.levelDraft) {
      this.saveLevelOverrides();
    }

    // 5. Restore standard game loop state
    this.app.gameState = 'playing';
    
    // Restore ship mesh visibility
    if (this.graphics.shipMesh) {
      this.graphics.shipMesh.visible = true;
    }
    
    // Restore in-game UI HUD triggers
    if (this.app.bottomHudEnabled) {
      const hud = document.getElementById('hud');
      if (hud) hud.classList.remove('hidden');
    }
    const btnInGamePause = document.getElementById('btn-in-game-pause');
    if (btnInGamePause) btnInGamePause.classList.remove('hidden');
    if (this.app.keyboard && this.app.keyboard.touchControlsEnabled && this.app.touchManager) {
      this.app.touchManager.show();
    }
    
    if (window.gameAudio) {
      window.gameAudio.startEngine();
    }

    // Reset physics state to spawn safely on the edited road
    this.app.physics.reset(this.app.levelInfo.fuel, this.app.levelInfo.oxygen);
    const { spawnX, spawnY, spawnZ } = this.app.findSafeSpawnPosition();
    this.app.physics.position.set(spawnX, spawnY, spawnZ);
    this.app.physics.onGround = false;

    this.showStatusMessage("Returned to Gameplay");
  }

  /**
   * Unpacks the current active cooked level data object into the editor draft format.
   */
  unpackCurrentLevel() {
    const cooked = this.app.currentLevelData;
    if (!cooked) return;

    // Convert cooked rows back to unpacked cell properties
    const unpackedRows = cooked.rows.map(row => {
      if (!Array.isArray(row)) return Array(7).fill(null);
      return row.map(cell => {
        if (!cell) return null;
        
        let type = 'road';
        if (cell.tunnel) type = 'tunnel';
        else if (cell.ramp) type = 'ramp';
        else if (cell.full) type = 'obstacle-full';
        else if (cell.half) type = 'obstacle-half';
        
        const colorIdx = cell.val !== undefined ? cell.val : (cell.low3 !== undefined ? cell.low3 : (cell.top_color || cell.bottom_color || 1));

        const draftCell = {
          type,
          colorIdx: parseInt(colorIdx) || 1
        };

        if (type === 'ramp') {
          draftCell.ramp = {
            direction: cell.direction || 'forward',
            startY: cell.startY !== undefined ? parseFloat(cell.startY) : 0.0,
            endY: cell.endY !== undefined ? parseFloat(cell.endY) : 1.0
          };
        }

        return draftCell;
      });
    });

    this.levelDraft = {
      name: cooked.name || `Level ${cooked.level_index || 0}`,
      author: cooked.author || "Designer",
      parTime: cooked.parTime || 45,
      biome: cooked.biome || 0,
      physics: {
        gravity: cooked.gravity || 8,
        oxygen: cooked.oxygen || 60,
        fuel: cooked.fuel || 130
      },
      rows: unpackedRows
    };

    // Reset undo queues
    this.history = [];
    this.redoStack = [];
  }

  /**
   * Save the current state draft back to LocalStorage overrides.
   */
  saveLevelOverrides() {
    const cooked = this.cookLevel();
    
    // Save to cache
    const cachedPack = this.app.getCachedPack(this.app.currentPack);
    if (cachedPack) {
      cachedPack[this.app.currentLevelIndex] = cooked;
    }
    this.app.currentLevelData = cooked;
    window.currentLevelData = cooked;

    // Save permanently to localStorage
    const storageKey = `skyroads_override_${this.app.currentPack}_${this.app.currentLevelIndex}`;
    localStorage.setItem(storageKey, JSON.stringify(cooked));

    // Async rebuild track visual meshes in scene
    this.rebuildTrackMeshes();
  }

  /**
   * Revert overrides from localStorage and restore default level data.
   */
  static resetLevelOverrides(app, pack, index) {
    const storageKey = `skyroads_override_${pack}_${index}`;
    localStorage.removeItem(storageKey);
  }

  /**
   * Converts draft level format back to the game's optimized cooked structure.
   */
  cookLevel() {
    const draft = this.levelDraft;
    const fallbackPalette = [
      [0,0,0], [128,128,128], [255,255,255], [0,128,0], [0,255,0],
      [0,0,128], [0,0,255], [128,0,0], [255,0,0], [128,128,0],
      [255,255,0], [0,128,128], [0,255,255], [128,0,128], [255,0,255], [64,64,64]
    ];
    const palette = draft.palette || DEFAULT_PALETTES;

    const cookedRows = draft.rows.map(row => {
      return row.map(cell => {
        if (!cell) return null;
        
        const cookedCell = {
          val: cell.colorIdx !== undefined ? cell.colorIdx : 1,
          full: cell.type === 'obstacle-full',
          half: cell.type === 'obstacle-half',
          tunnel: cell.type === 'tunnel',
          top_color: 0,
          bottom_color: 0,
          low3: cell.colorIdx !== undefined ? cell.colorIdx : 1
        };

        if (cookedCell.full || cookedCell.half) {
          cookedCell.top_color = cell.colorIdx !== undefined ? cell.colorIdx : 11;
          cookedCell.bottom_color = 0;
        } else {
          cookedCell.top_color = 0;
          cookedCell.bottom_color = cell.colorIdx !== undefined ? cell.colorIdx : 1;
        }

        if (cell.type === 'ramp') {
          cookedCell.ramp = true;
          cookedCell.startY = cell.ramp?.startY !== undefined ? cell.ramp.startY : 0.0;
          cookedCell.endY = cell.ramp?.endY !== undefined ? cell.ramp.endY : 1.0;
          cookedCell.direction = cell.ramp?.direction || 'forward';
          cookedCell.top_color = cell.colorIdx !== undefined ? cell.colorIdx : 1;
          cookedCell.bottom_color = 0;
        }

        return cookedCell;
      });
    });

    return {
      level_index: this.app.currentLevelIndex,
      name: draft.name,
      author: draft.author,
      parTime: draft.parTime,
      biome: draft.biome,
      gravity: draft.physics.gravity,
      fuel: draft.physics.fuel,
      oxygen: draft.physics.oxygen,
      palette: palette,
      rows: cookedRows
    };
  }

  /**
   * Rebuilds the Three.js mesh geometry of the active level.
   */
  async rebuildTrackMeshes() {
    this.graphics.clearLevel();
    
    // Clear old road meshes
    if (this.app.levelInfo && this.app.levelInfo.roadMeshes) {
      this.app.levelInfo.roadMeshes.forEach(mesh => {
        this.graphics.scene.remove(mesh);
        mesh.traverse((node) => {
          if (node.geometry) node.geometry.dispose();
          if (node.material) {
            if (Array.isArray(node.material)) node.material.forEach(m => m.dispose());
            else node.material.dispose();
          }
        });
      });
    }

    // Rebuild async
    const cooked = this.cookLevel();
    this.app.levelInfo = await buildLevelAsync(
      cooked,
      this.graphics.scene,
      () => {} // no loading bar updates needed
    );

    // Re-spawn decoration buildings
    this.graphics.spawnCityScenery(this.app.levelInfo.trackLength, 0);
  }

  /**
   * Playtest the current level state in-memory.
   */
  startPlaytest() {
    // 1. Release pointer lock
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
    
    // 2. Hide editor UI HTML
    const overlays = ['editor-top-bar', 'editor-left-toolbar', 'editor-right-properties', 'editor-crosshair'];
    overlays.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });

    // 3. Rebuild active road meshes to match edits
    this.saveLevelOverrides();

    // 4. Temporarily flip game state back to playing
    this.app.gameState = 'playing';

    // Show ship
    if (this.graphics.shipMesh) {
      this.graphics.shipMesh.visible = true;
    }

    // Spawn ship near the editor flying camera's current Z coordinate (or start of level)
    const editorZ = this.cameraPosition.z;
    // Map Z back to row index
    let spawnRow = Math.max(0, Math.min(this.levelDraft.rows.length - 1, Math.floor(-editorZ / TILE_LENGTH)));
    
    // Find closest row with solid tiles near spawnRow
    let foundSafe = false;
    for (let offset = 0; offset < 20; offset++) {
      const checkRow = Math.max(0, spawnRow - offset);
      if (this.levelDraft.rows[checkRow].some(t => t !== null)) {
        spawnRow = checkRow;
        foundSafe = true;
        break;
      }
    }
    if (!foundSafe) spawnRow = 0; // fallback to start

    // Set spawn coordinates
    this.app.physics.reset(this.app.levelInfo.fuel, this.app.levelInfo.oxygen);
    this.app.physics.position.set(0, 0.3, -(spawnRow + 0.5) * TILE_LENGTH);
    this.app.physics.onGround = false;

    // Show cockpit HUD
    if (this.app.bottomHudEnabled) {
      const hud = document.getElementById('hud');
      if (hud) hud.classList.remove('hidden');
    }
    
    if (window.gameAudio) {
      window.gameAudio.startEngine();
    }

    // Bind Esc listener dynamically to exit playtest
    const exitPlaytestHandler = (e) => {
      if (e.code === 'Escape') {
        e.preventDefault();
        window.removeEventListener('keydown', exitPlaytestHandler);
        this.exitPlaytest();
      }
    };
    window.addEventListener('keydown', exitPlaytestHandler);
    this.app.playtestEscHandler = exitPlaytestHandler; // store reference to clean up

    this.showStatusMessage("PLAYTESTING - Press ESC to return to Editor");
  }

  /**
   * Exits playtest mode and returns to editor state.
   */
  exitPlaytest() {
    this.app.gameState = 'editor';
    if (window.gameAudio) {
      window.gameAudio.stopEngine();
    }

    // Hide ship
    if (this.graphics.shipMesh) {
      this.graphics.shipMesh.visible = false;
    }

    // Hide cockpit HUD
    const hud = document.getElementById('hud');
    if (hud) hud.classList.add('hidden');
    if (this.app.touchManager) this.app.touchManager.hide();

    // Show editor overlays
    const overlays = ['editor-top-bar', 'editor-left-toolbar', 'editor-right-properties', 'editor-crosshair'];
    overlays.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = '';
    });

    // Reset camera position to match the ship's last position before exit
    const shipPos = this.app.physics.position;
    this.cameraPosition.set(shipPos.x, shipPos.y + 3, shipPos.z + 8);
    this.updateCameraTransform();

    this.showStatusMessage("Returned to Editor Mode");
  }

  /**
   * Executes a cell painting change with full command history support.
   */
  paintCell(lane, row, newCellProps) {
    if (lane < 0 || lane > 6 || row < 0 || row >= this.levelDraft.rows.length) return;

    const previousCell = deepClone(this.levelDraft.rows[row][lane]);
    const nextCell = newCellProps ? deepClone(newCellProps) : null;

    const execute = () => {
      const newRows = [...this.levelDraft.rows];
      newRows[row] = [...newRows[row]];
      newRows[row][lane] = nextCell;
      this.levelDraft = {
        ...this.levelDraft,
        rows: newRows
      };
      this.rebuildTrackMeshes();
    };

    const undo = () => {
      const newRows = [...this.levelDraft.rows];
      newRows[row] = [...newRows[row]];
      newRows[row][lane] = previousCell;
      this.levelDraft = {
        ...this.levelDraft,
        rows: newRows
      };
      this.rebuildTrackMeshes();
    };

    const desc = newCellProps 
      ? `Paint ${newCellProps.type} at Row ${row}, Lane ${lane + 1}`
      : `Erase cell at Row ${row}, Lane ${lane + 1}`;

    const command = new EditorCommand(execute, undo, desc);
    command.execute();
    
    this.history.push(command);
    this.redoStack = [];
    
    this.syncPropertiesPanel();
  }

  undo() {
    if (this.history.length === 0) return;
    const cmd = this.history.pop();
    cmd.undo();
    this.redoStack.push(cmd);
    this.showStatusMessage(`Undone: ${cmd.description}`);
  }

  redo() {
    if (this.redoStack.length === 0) return;
    const cmd = this.redoStack.pop();
    cmd.execute();
    this.history.push(cmd);
    this.showStatusMessage(`Redone: ${cmd.description}`);
  }

  /**
   * Flying camera keyboard translation & pointer look updates.
   */
  update(dt) {
    if (!this.active || this.app.gameState !== 'editor') return;

    // Cap dt to prevent frame lag spikes
    const delta = Math.min(0.05, dt);

    // 1. Move camera based on keystate
    const moveVector = new THREE.Vector3();
    if (this.keyboardState.forward) moveVector.z -= 1;
    if (this.keyboardState.backward) moveVector.z += 1;
    if (this.keyboardState.left) moveVector.x -= 1;
    if (this.keyboardState.right) moveVector.x += 1;
    moveVector.normalize();

    // Verticals
    if (this.keyboardState.up) moveVector.y += 1;
    if (this.keyboardState.down) moveVector.y -= 1;

    // Apply rotation transforms relative to camera face yaw
    const forwardDirection = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(0, this.cameraYaw, 0));
    const rightDirection = new THREE.Vector3(1, 0, 0).applyEuler(new THREE.Euler(0, this.cameraYaw, 0));

    const translation = new THREE.Vector3()
      .addScaledVector(forwardDirection, -moveVector.z)
      .addScaledVector(rightDirection, moveVector.x)
      .addScaledVector(new THREE.Vector3(0, 1, 0), moveVector.y);
    
    translation.multiplyScalar(this.flySpeed * delta);
    this.cameraPosition.add(translation);

    this.updateCameraTransform();

    // 2. Perform 3D raycast target snap guide
    this.updateRaycasting();
  }

  updateCameraTransform() {
    const camera = this.graphics.camera;
    camera.position.copy(this.cameraPosition);
    
    camera.rotation.set(0, 0, 0);
    camera.rotation.y = this.cameraYaw;
    camera.rotation.x = this.cameraPitch;
  }

  /**
   * Casts a ray from the center of the screen to identify hovered blocks/grid coordinates.
   */
  updateRaycasting() {
    const camera = this.graphics.camera;
    this.raycaster.setFromCamera(this.mouse2D, camera);

    if (this.keyboardState.shift) {
      // Raycast directly onto the horizontal plane at Y = activePlaneHeight
      const planeY = this.activePlaneHeight;
      const targetPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY);
      const intersection = new THREE.Vector3();
      
      if (this.raycaster.ray.intersectPlane(targetPlane, intersection)) {
        let lane = Math.round(intersection.x / TILE_WIDTH) + 3;
        let row = Math.floor(-intersection.z / TILE_LENGTH);
        const height = planeY;

        lane = Math.max(0, Math.min(6, lane));
        row = Math.max(0, Math.min(this.levelDraft.rows.length - 1, row));

        this.hoverCoord = { lane, row, height };

        // Update hover visual box position
        this.hoverBox.position.set(
          (lane - 3) * TILE_WIDTH,
          height,
          -row * TILE_LENGTH - TILE_LENGTH / 2
        );
        this.hoverBox.visible = true;

        if (this.mouseState.left || this.mouseState.right) {
          this.triggerPaintAtHover();
        }
      } else {
        this.hoverCoord = null;
        this.hoverBox.visible = false;
      }
      return;
    }

    // Find intersections with all children in scene
    // First let's get list of meshes representing the road/obstacles
    const targets = [];
    this.graphics.scene.traverse(child => {
      if (child.isMesh && child.visible && child !== this.hoverBox) {
        targets.push(child);
      }
    });

    const intersections = this.raycaster.intersectObjects(targets, false);
    
    if (intersections.length > 0) {
      const intersect = intersections[0];
      const point = intersect.point;
      const normal = intersect.face.normal.clone();
      
      // Transform normal relative to mesh rotation
      if (intersect.object) {
        normal.applyQuaternion(intersect.object.quaternion);
      }

      // Convert point to grid coordinates
      // Snapped Lane (c)
      let lane = Math.round(point.x / TILE_WIDTH) + 3;
      lane = Math.max(0, Math.min(6, lane));

      // Snapped Row (r)
      let row = Math.floor(-point.z / TILE_LENGTH);
      row = Math.max(0, Math.min(this.levelDraft.rows.length - 1, row));

      // Height
      let height = Math.round(point.y);

      // Handle snaps like Minecraft:
      // Since Shift is not held here, calculate adjacent grid coordinate based on the intersected block face normal
      const normalThreshold = 0.5;
      if (normal.y > normalThreshold) {
        // clicked top face -> place on top
        height = Math.round(point.y + 0.5);
      } else if (normal.y < -normalThreshold) {
        // clicked bottom face -> place below
        height = Math.round(point.y - 0.5);
      } else if (normal.z > normalThreshold) {
        // clicked back face -> place backward (larger Z / smaller row)
        row = Math.floor(-(point.z + 0.5 * TILE_LENGTH) / TILE_LENGTH);
      } else if (normal.z < -normalThreshold) {
        // clicked front face -> place forward (smaller Z / larger row)
        row = Math.floor(-(point.z - 0.5 * TILE_LENGTH) / TILE_LENGTH);
      } else if (normal.x > normalThreshold) {
        // clicked right face -> place right (larger X / larger lane)
        lane = Math.round((point.x + 0.5 * TILE_WIDTH) / TILE_WIDTH) + 3;
      } else if (normal.x < -normalThreshold) {
        // clicked left face -> place left (smaller X / smaller lane)
        lane = Math.round((point.x - 0.5 * TILE_WIDTH) / TILE_WIDTH) + 3;
      }

      // Safe bounds capping
      lane = Math.max(0, Math.min(6, lane));
      row = Math.max(0, Math.min(this.levelDraft.rows.length - 1, row));
      height = Math.max(0, Math.min(5, height));

      this.hoverCoord = { lane, row, height };

      // Update hover visual box position
      this.hoverBox.position.set(
        (lane - 3) * TILE_WIDTH,
        height,
        -row * TILE_LENGTH - TILE_LENGTH / 2
      );
      this.hoverBox.visible = true;

      if (this.mouseState.left || this.mouseState.right) {
        this.triggerPaintAtHover();
      }
    } else {
      // Raycast onto standard flat Y=0 grid plane if no intersections exist
      const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const intersection = new THREE.Vector3();
      
      if (this.raycaster.ray.intersectPlane(groundPlane, intersection)) {
        let lane = Math.round(intersection.x / TILE_WIDTH) + 3;
        let row = Math.floor(-intersection.z / TILE_LENGTH);
        let height = 0;

        lane = Math.max(0, Math.min(6, lane));
        row = Math.max(0, Math.min(this.levelDraft.rows.length - 1, row));
        height = Math.max(0, Math.min(5, height));

        this.hoverCoord = { lane, row, height };

        this.hoverBox.position.set(
          (lane - 3) * TILE_WIDTH,
          height,
          -row * TILE_LENGTH - TILE_LENGTH / 2
        );
        this.hoverBox.visible = true;

        if (this.mouseState.left || this.mouseState.right) {
          this.triggerPaintAtHover();
        }
      } else {
        this.hoverCoord = null;
        this.hoverBox.visible = false;
      }
    }
  }

  triggerPaintAtHover() {
    if (!this.hoverCoord) return;
    const { lane, row, height } = this.hoverCoord;

    // Check if we already painted this cell in this drag gesture
    if (this.lastPaintedCoord &&
        this.lastPaintedCoord.lane === lane &&
        this.lastPaintedCoord.row === row &&
        this.lastPaintedCoord.height === height) {
      return;
    }

    this.lastPaintedCoord = { lane, row, height };

    if (this.mouseState.left) {
      const cellProps = {
        type: this.activeBrush,
        colorIdx: this.activeColorIdx
      };

      if (this.activeBrush === 'ramp') {
        cellProps.ramp = {
          direction: 'forward',
          startY: height * 1.0,
          endY: (height + 1) * 1.0
        };
      }

      this.paintCell(lane, row, cellProps);
    } else if (this.mouseState.right) {
      this.paintCell(lane, row, null);
    }
  }

  /**
   * Setup hover guides wireframe box
   */
  createHoverGuides() {
    const boxGeom = new THREE.BoxGeometry(TILE_WIDTH + 0.05, 0.45, TILE_LENGTH + 0.05);
    const edge = new THREE.EdgesGeometry(boxGeom);
    const lineMat = new THREE.LineBasicMaterial({ color: 0xff00ff, linewidth: 2.5 });
    
    this.hoverBox = new THREE.LineSegments(edge, lineMat);
    this.hoverBox.visible = false;
    this.graphics.scene.add(this.hoverBox);
  }

  /**
   * Helper grid boundaries and rules overlays.
   */
  rebuildHelperGrid() {
    if (this.gridLines) {
      this.graphics.scene.remove(this.gridLines);
    }

    this.gridLines = new THREE.Group();

    const gridColor = 0x334466;
    const maxRows = this.levelDraft.rows.length;
    const maxZ = -maxRows * TILE_LENGTH;
    const roadWidth = TILE_WIDTH * 7;

    // 1. Z grid lines (run along road lanes)
    for (let c = 0; c <= 7; c++) {
      const x = (c - 3.5) * TILE_WIDTH;
      const points = [
        new THREE.Vector3(x, 0.01, 0),
        new THREE.Vector3(x, 0.01, maxZ)
      ];
      const geom = new THREE.BufferGeometry().setFromPoints(points);
      const mat = new THREE.LineBasicMaterial({ color: gridColor });
      this.gridLines.add(new THREE.Line(geom, mat));
    }

    // 2. X grid lines (run across road lanes)
    for (let r = 0; r <= maxRows; r++) {
      const z = -r * TILE_LENGTH;
      const points = [
        new THREE.Vector3(-roadWidth / 2, 0.01, z),
        new THREE.Vector3(roadWidth / 2, 0.01, z)
      ];
      const geom = new THREE.BufferGeometry().setFromPoints(points);
      const mat = new THREE.LineBasicMaterial({ 
        color: r % 5 === 0 ? 0x6688cc : gridColor,
        linewidth: r % 5 === 0 ? 2 : 1
      });
      this.gridLines.add(new THREE.Line(geom, mat));
    }

    this.graphics.scene.add(this.gridLines);
  }

  /**
   * Bind event listeners for flying camera inputs.
   */
  setupListeners() {
    this._onKeyDown = (e) => {
      // Skip if focused on properties form inputs
      if (document.activeElement && 
         (document.activeElement.tagName === 'INPUT' || 
          document.activeElement.tagName === 'SELECT')) {
        if (e.code === 'Escape') {
          document.activeElement.blur();
        }
        return;
      }

      if (e.code === 'KeyW' || e.code === 'ArrowUp') this.keyboardState.forward = true;
      if (e.code === 'KeyS' || e.code === 'ArrowDown') this.keyboardState.backward = true;
      if (e.code === 'KeyA' || e.code === 'ArrowLeft') this.keyboardState.left = true;
      if (e.code === 'KeyD' || e.code === 'ArrowRight') this.keyboardState.right = true;
      if (e.code === 'Space') {
        e.preventDefault();
        this.keyboardState.up = true;
      }
      if (e.code === 'ControlLeft' || e.code === 'KeyC') {
        this.keyboardState.down = true;
      }
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        this.keyboardState.shift = true;
        // Lock plane to whatever height we currently hover or active height
        if (this.hoverCoord) {
          this.activePlaneHeight = this.hoverCoord.height;
        }
      }

      // Hotkeys
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') {
        e.preventDefault();
        this.undo();
      }
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyY') {
        e.preventDefault();
        this.redo();
      }
      if (e.code === 'F5') {
        e.preventDefault();
        this.startPlaytest();
      }
    };

    this._onKeyUp = (e) => {
      if (e.code === 'KeyW' || e.code === 'ArrowUp') this.keyboardState.forward = false;
      if (e.code === 'KeyS' || e.code === 'ArrowDown') this.keyboardState.backward = false;
      if (e.code === 'KeyA' || e.code === 'ArrowLeft') this.keyboardState.left = false;
      if (e.code === 'KeyD' || e.code === 'ArrowRight') this.keyboardState.right = false;
      if (e.code === 'Space') this.keyboardState.up = false;
      if (e.code === 'ControlLeft' || e.code === 'KeyC') this.keyboardState.down = false;
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        this.keyboardState.shift = false;
      }
    };

    this._onMouseMove = (e) => {
      if (!this.pointerLocked) return;
      
      this.cameraYaw -= e.movementX * this.mouseSensitivity;
      this.cameraPitch -= e.movementY * this.mouseSensitivity;

      // Cap pitch to prevent flipping upside down
      const limit = Math.PI / 2 - 0.05;
      this.cameraPitch = Math.max(-limit, Math.min(limit, this.cameraPitch));
    };

    this._onPointerLockChange = () => {
      this.pointerLocked = (document.pointerLockElement === this.graphics.renderer.domElement);
      const crosshair = document.getElementById('editor-crosshair');
      if (crosshair) {
        crosshair.style.display = this.pointerLocked ? 'block' : 'none';
      }
      if (!this.pointerLocked) {
        this.mouseState.left = false;
        this.mouseState.right = false;
        this.lastPaintedCoord = null;
      }
    };

    this._onMouseDown = (e) => {
      // Only paint if clicking inside viewport container
      const container = document.getElementById('canvas-container');
      if (!container.contains(e.target)) return;

      if (!this.pointerLocked) {
        // Request pointer lock to steer camera
        this.graphics.renderer.domElement.requestPointerLock();
        return;
      }

      if (e.button === 0) {
        // Left-Click: Paint block
        this.mouseState.left = true;
        this.triggerPaintAtHover();
      } else if (e.button === 2) {
        // Right-Click: Erase/Void
        this.mouseState.right = true;
        this.triggerPaintAtHover();
      } else if (e.button === 1) {
        // Middle-Click: Pick block type
        if (!this.hoverCoord) return;
        const { lane, row } = this.hoverCoord;
        const cell = this.levelDraft.rows[row][lane];
        if (cell) {
          this.activeBrush = cell.type;
          this.activeColorIdx = cell.colorIdx;
          this.updateActiveBrushUI();
        }
      }
    };

    this._onMouseUp = (e) => {
      if (e.button === 0) {
        this.mouseState.left = false;
      } else if (e.button === 2) {
        this.mouseState.right = false;
      }
      this.lastPaintedCoord = null;
    };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    document.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('pointerlockchange', this._onPointerLockChange);
    window.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);

    // Disable context menu so right-click is clean
    this._onContextMenu = (e) => e.preventDefault();
    window.addEventListener('contextmenu', this._onContextMenu);
  }

  cleanupListeners() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    document.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('pointerlockchange', this._onPointerLockChange);
    window.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mouseup', this._onMouseUp);
    window.removeEventListener('contextmenu', this._onContextMenu);
    
    // Clean up playtest esc listener if it was left active
    if (this.app.playtestEscHandler) {
      window.removeEventListener('keydown', this.app.playtestEscHandler);
      this.app.playtestEscHandler = null;
    }
  }

  /**
   * Injects the glassmorphism HTML layout for the editor directly on top of the canvas.
   */
  injectEditorUI() {
    // 1. Top bar Actions menu
    const topBar = document.createElement('div');
    topBar.id = 'editor-top-bar';
    topBar.className = 'editor-overlay-bar';
    topBar.innerHTML = `
      <div class="editor-header-title">
        <span class="text-glow">ROAD EDITOR</span>
      </div>
      <div class="editor-actions-group">
        <button id="btn-editor-playtest" class="btn btn-primary btn-glow" title="Playtest level from cursor (F5)">PLAYTEST (F5)</button>
        <button id="btn-editor-undo" class="btn btn-secondary" title="Undo change (Ctrl+Z)">UNDO</button>
        <button id="btn-editor-redo" class="btn btn-secondary" title="Redo change (Ctrl+Y)">REDO</button>
        <button id="btn-editor-collapse" class="btn btn-secondary" title="Toggle Sidebar Panels">PANELS</button>
        <button id="btn-editor-exit" class="btn btn-danger btn-glow" title="Save changes and return to game">EXIT & SAVE</button>
      </div>
    `;
    document.body.appendChild(topBar);

    // 2. Left side brush selection palette
    const leftPalette = document.createElement('div');
    leftPalette.id = 'editor-left-toolbar';
    leftPalette.className = 'editor-overlay-sidebar left-bar';
    leftPalette.innerHTML = `
      <div class="panel-section">
        <div class="panel-header">GEOMETRY BRUSHES</div>
        <div class="brush-row" data-brush="road">
          <span class="brush-icon icon-green"></span>
          <span>Flat Road</span>
        </div>
        <div class="brush-row" data-brush="obstacle-half">
          <span class="brush-icon icon-yellow"></span>
          <span>Half Obstacle</span>
        </div>
        <div class="brush-row" data-brush="obstacle-full">
          <span class="brush-icon icon-orange"></span>
          <span>Full Obstacle</span>
        </div>
        <div class="brush-row" data-brush="tunnel">
          <span class="brush-icon icon-blue"></span>
          <span>Tunnel Arch</span>
        </div>
        <div class="brush-row" data-brush="ramp">
          <span class="brush-icon icon-cyan"></span>
          <span>Ramp / Slope</span>
        </div>
      </div>
      
      <div class="panel-section" style="margin-top: 15px;">
        <div class="panel-header">BEHAVIOR COLOR TAGS</div>
        <div class="color-grid">
          <button class="color-btn" data-color="1" style="background-color: #0000aa;" title="Color 1 - Dark Blue"></button>
          <button class="color-btn" data-color="2" style="background-color: #00aa00;" title="Color 2 - Green"></button>
          <button class="color-btn" data-color="3" style="background-color: #00aaaa;" title="Color 3 - Sticky (Green)"></button>
          <button class="color-btn" data-color="6" style="background-color: #aa5500;" title="Color 6 - Brown"></button>
          <button class="color-btn" data-color="9" style="background-color: #5555ff;" title="Color 9 - Slippery (Blue)"></button>
          <button class="color-btn" data-color="10" style="background-color: #55ff55;" title="Color 10 - Refill Oxygen/Fuel"></button>
          <button class="color-btn" data-color="11" style="background-color: #55ffff;" title="Color 11 - Boost speed"></button>
          <button class="color-btn" data-color="12" style="background-color: #ff5555;" title="Color 12 - Super Boost speed"></button>
          <button class="color-btn" data-color="13" style="background-color: #ff55ff;" title="Color 13 - Burning / Hazard"></button>
          <button class="color-btn" data-color="14" style="background-color: #ffff55;" title="Color 14 - High Jump"></button>
        </div>
      </div>
    `;
    document.body.appendChild(leftPalette);

    // 3. Right side Properties Panel
    const rightPanel = document.createElement('div');
    rightPanel.id = 'editor-right-properties';
    rightPanel.className = 'editor-overlay-sidebar right-bar';
    rightPanel.innerHTML = `
      <div class="panel-section">
        <div class="panel-header">TRACK SETTINGS</div>
        <div class="form-row">
          <label>Name</label>
          <input type="text" id="edit-level-name" value="">
        </div>
        <div class="form-row">
          <label>Par Time (s)</label>
          <input type="number" id="edit-level-partime" min="10" max="999" value="45">
        </div>
        <div class="form-row">
          <label>Theme (Biome)</label>
          <select id="edit-level-theme">
            <option value="0">Core Space Theme</option>
            <option value="1">Cyberpunk Neon</option>
            <option value="2">Industrial Slag</option>
            <option value="3">Organic Ridge</option>
          </select>
        </div>
      </div>

      <div class="panel-section" style="margin-top: 15px;">
        <div class="panel-header">PHYSICS OVERRIDES</div>
        <div class="form-row">
          <label>Gravity</label>
          <input type="range" id="edit-physics-gravity" min="1" max="20" value="8">
          <span id="lbl-edit-gravity" class="val-lbl">8</span>
        </div>
        <div class="form-row">
          <label>Oxygen Drain</label>
          <input type="range" id="edit-physics-oxygen" min="0" max="200" step="5" value="60">
          <span id="lbl-edit-oxygen" class="val-lbl">60</span>
        </div>
        <div class="form-row">
          <label>Starting Fuel</label>
          <input type="range" id="edit-physics-fuel" min="20" max="300" step="5" value="130">
          <span id="lbl-edit-fuel" class="val-lbl">130</span>
        </div>
      </div>

      <div class="panel-section" style="margin-top: 15px;">
        <div class="panel-header">BLOCK DETAILS</div>
        <div id="block-info-empty" class="info-empty">
          Click a block with middle-mouse to load details.
        </div>
        <div id="block-info-active" style="display: none;">
          <div class="form-row">
            <label>Type</label>
            <span id="lbl-block-type" style="color: #ff00ff; font-weight: bold;">road</span>
          </div>
          <div class="form-row">
            <label>Color Index</label>
            <span id="lbl-block-color">11</span>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(rightPanel);

    // 4. Crosshair Reticle Overlay
    const crosshair = document.createElement('div');
    crosshair.id = 'editor-crosshair';
    crosshair.className = 'editor-crosshair-dot';
    crosshair.style.display = 'none';
    document.body.appendChild(crosshair);

    // Bind UI actions
    document.getElementById('btn-editor-playtest').addEventListener('click', () => this.startPlaytest());
    document.getElementById('btn-editor-undo').addEventListener('click', () => this.undo());
    document.getElementById('btn-editor-redo').addEventListener('click', () => this.redo());
    document.getElementById('btn-editor-exit').addEventListener('click', () => this.deactivate(true));
    
    document.getElementById('btn-editor-collapse').addEventListener('click', () => {
      this.uiCollapsed = !this.uiCollapsed;
      leftPalette.classList.toggle('collapsed', this.uiCollapsed);
      rightPanel.classList.toggle('collapsed', this.uiCollapsed);
    });

    // Brush selectors
    const brushRows = leftPalette.querySelectorAll('.brush-row');
    brushRows.forEach(row => {
      row.addEventListener('click', () => {
        this.activeBrush = row.getAttribute('data-brush');
        this.updateActiveBrushUI();
      });
    });

    // Color buttons
    const colorBtns = leftPalette.querySelectorAll('.color-btn');
    colorBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.activeColorIdx = parseInt(btn.getAttribute('data-color'));
        colorBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // Form settings changes
    const editName = document.getElementById('edit-level-name');
    editName.addEventListener('change', () => {
      this.levelDraft.name = editName.value;
    });

    const editPar = document.getElementById('edit-level-partime');
    editPar.addEventListener('change', () => {
      this.levelDraft.parTime = parseInt(editPar.value) || 45;
    });

    const editTheme = document.getElementById('edit-level-theme');
    editTheme.addEventListener('change', () => {
      this.levelDraft.biome = parseInt(editTheme.value) || 0;
      this.rebuildTrackMeshes();
    });

    // Physics
    const editGrav = document.getElementById('edit-physics-gravity');
    editGrav.addEventListener('input', () => {
      document.getElementById('lbl-edit-gravity').innerText = editGrav.value;
      this.levelDraft.physics.gravity = parseInt(editGrav.value);
    });

    const editOxy = document.getElementById('edit-physics-oxygen');
    editOxy.addEventListener('input', () => {
      document.getElementById('lbl-edit-oxygen').innerText = editOxy.value;
      this.levelDraft.physics.oxygen = parseInt(editOxy.value);
    });

    const editFuel = document.getElementById('edit-physics-fuel');
    editFuel.addEventListener('input', () => {
      document.getElementById('lbl-edit-fuel').innerText = editFuel.value;
      this.levelDraft.physics.fuel = parseInt(editFuel.value);
    });

    this.updateActiveBrushUI();
  }

  /**
   * Updates visual active highlights on the brush toolbar buttons.
   */
  updateActiveBrushUI() {
    const leftPalette = document.getElementById('editor-left-toolbar');
    if (!leftPalette) return;

    const brushRows = leftPalette.querySelectorAll('.brush-row');
    brushRows.forEach(row => {
      if (row.getAttribute('data-brush') === this.activeBrush) {
        row.classList.add('active');
      } else {
        row.classList.remove('active');
      }
    });

    // Match behavior color active border
    const colorBtns = leftPalette.querySelectorAll('.color-btn');
    colorBtns.forEach(btn => {
      if (parseInt(btn.getAttribute('data-color')) === this.activeColorIdx) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // Sync Details
    const blockEmpty = document.getElementById('block-info-empty');
    const blockActive = document.getElementById('block-info-active');
    if (blockEmpty && blockActive) {
      blockEmpty.style.display = 'none';
      blockActive.style.display = 'block';
      document.getElementById('lbl-block-type').innerText = this.activeBrush.toUpperCase();
      document.getElementById('lbl-block-color').innerText = this.activeColorIdx;
    }
  }

  /**
   * Syncs level metadata fields inside properties panel from active level state.
   */
  syncPropertiesPanel() {
    if (!this.active || !this.levelDraft) return;

    const nameEl = document.getElementById('edit-level-name');
    const parEl = document.getElementById('edit-level-partime');
    const themeEl = document.getElementById('edit-level-theme');
    
    if (nameEl) nameEl.value = this.levelDraft.name;
    if (parEl) parEl.value = this.levelDraft.parTime;
    if (themeEl) themeEl.value = this.levelDraft.biome;

    const editGrav = document.getElementById('edit-physics-gravity');
    const editOxy = document.getElementById('edit-physics-oxygen');
    const editFuel = document.getElementById('edit-physics-fuel');

    if (editGrav) {
      editGrav.value = this.levelDraft.physics.gravity;
      document.getElementById('lbl-edit-gravity').innerText = editGrav.value;
    }
    if (editOxy) {
      editOxy.value = this.levelDraft.physics.oxygen;
      document.getElementById('lbl-edit-oxygen').innerText = editOxy.value;
    }
    if (editFuel) {
      editFuel.value = this.levelDraft.physics.fuel;
      document.getElementById('lbl-edit-fuel').innerText = editFuel.value;
    }
  }

  /**
   * Helper to print dynamic statuses in the UI overlay.
   */
  showStatusMessage(msg) {
    let alertEl = document.getElementById('editor-status-alert');
    if (!alertEl) {
      alertEl = document.createElement('div');
      alertEl.id = 'editor-status-alert';
      alertEl.className = 'editor-status-popup';
      document.body.appendChild(alertEl);
    }
    alertEl.innerText = msg;
    alertEl.style.opacity = '1';
    
    if (this._alertTimeout) clearTimeout(this._alertTimeout);
    this._alertTimeout = setTimeout(() => {
      alertEl.style.opacity = '0';
    }, 2000);
  }
}
