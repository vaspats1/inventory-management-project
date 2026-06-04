/* ═══════════════════════════════════════════════════════════
   THESSALONIKI STREETS — Alpha
   Single-file Three.js game (THREE global from CDN)
   ═══════════════════════════════════════════════════════════ */

'use strict';

// ── CONSTANTS ──────────────────────────────────────────────
const MAP_HALF    = 280;
const CELL        = 70;
const STREET      = 20;
const BLOCK       = 50;
const GRID        = 8;
const ORIGIN      = -MAP_HALF;       // -280

const TEAM_DATA = {
  PAOK:    { jerseyColor: 0x111111, shortColor: 0xdddddd, accentColor: 0xffffff, name: 'PAOK' },
  IRAKLIS: { jerseyColor: 0x0044bb, shortColor: 0xffcc00, accentColor: 0xffcc00, name: 'IRAKLIS' },
};

const PLAYER_SPEED  = 5.5;
const RUN_SPEED     = 9.5;
const ENEMY_SPEED   = 4.2;
const CHAR_RADIUS   = 0.75;
const AGGRO_RANGE   = 22;
const ATTACK_RANGE  = 2.4;
const MELEE_RANGE   = 2.8;
const ENEMY_ENEMY_PUSH = 1.2;

// ── SEEDED RNG ─────────────────────────────────────────────
function makePRNG(seed) {
  let s = seed >>> 0;
  return {
    rand() { s = (Math.imul(1664525, s) + 1013904223) >>> 0; return s / 4294967296; },
    ri(a, b) { return Math.floor(this.rand() * (b - a + 1)) + a; },
    rf(a, b) { return this.rand() * (b - a) + a; },
    pick(arr) { return arr[this.ri(0, arr.length - 1)]; },
  };
}

// ── PHYSICS (2D AABB on XZ plane) ──────────────────────────
class Physics {
  constructor() { this.boxes = []; }

  addBox(minX, minZ, maxX, maxZ) {
    this.boxes.push({ minX, minZ, maxX, maxZ });
  }

  // Returns true if circle overlaps any box
  overlaps(cx, cz, r) {
    for (const b of this.boxes) {
      const nx = Math.max(b.minX, Math.min(cx, b.maxX));
      const nz = Math.max(b.minZ, Math.min(cz, b.maxZ));
      const dx = cx - nx, dz = cz - nz;
      if (dx * dx + dz * dz < r * r) return true;
    }
    return false;
  }

  // Slide-based movement: try X then Z separately
  move(pos, dx, dz, r) {
    const nx = pos.x + dx;
    if (!this.overlaps(nx, pos.z, r)) pos.x = nx;

    const nz = pos.z + dz;
    if (!this.overlaps(pos.x, nz, r)) pos.z = nz;

    // Clamp to map bounds
    pos.x = Math.max(ORIGIN + 2, Math.min(-ORIGIN - 2, pos.x));
    pos.z = Math.max(ORIGIN + 2, Math.min(-ORIGIN - 2, pos.z));
  }
}

// ── CITY GENERATOR ─────────────────────────────────────────
class City {
  constructor(scene, physics) {
    this.scene   = scene;
    this.physics = physics;
    this.rng     = makePRNG(1337);
    this.spawnPts = [];
  }

  generate() {
    this._makeGround();
    this._makeRoadLines();
    for (let gx = 0; gx < GRID; gx++)
      for (let gz = 0; gz < GRID; gz++)
        this._makeBlock(gx, gz);
    this._makeProps();
    this._makeLampPosts();
  }

  _makeGround() {
    const geo = new THREE.PlaneGeometry(680, 680);
    const mat = new THREE.MeshLambertMaterial({ color: 0x666666 });
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2;
    m.receiveShadow = true;
    this.scene.add(m);

    // Sidewalks (slightly raised tinted slabs)
    const swMat = new THREE.MeshLambertMaterial({ color: 0xaaaaaa });
    for (let gx = 0; gx < GRID; gx++) {
      for (let gz = 0; gz < GRID; gz++) {
        const bx = ORIGIN + gx * CELL + STREET / 2;
        const bz = ORIGIN + gz * CELL + STREET / 2;
        const sg = new THREE.PlaneGeometry(BLOCK, BLOCK);
        const sw = new THREE.Mesh(sg, swMat);
        sw.rotation.x = -Math.PI / 2;
        sw.position.set(bx + BLOCK / 2, 0.02, bz + BLOCK / 2);
        this.scene.add(sw);
      }
    }
  }

  _makeRoadLines() {
    const mat = new THREE.MeshLambertMaterial({ color: 0xeecc44 });
    for (let i = 0; i <= GRID; i++) {
      const coord = ORIGIN + i * CELL + CELL / 2;
      // Dashes along X axis roads
      for (let d = -MAP_HALF; d < MAP_HALF; d += 12) {
        const g = new THREE.PlaneGeometry(6, 0.4);
        const m = new THREE.Mesh(g, mat);
        m.rotation.x = -Math.PI / 2;
        m.position.set(d + 3, 0.03, coord - CELL / 2 + STREET / 2);
        this.scene.add(m);
      }
    }
  }

  _makeBlock(gx, gz) {
    const bx = ORIGIN + gx * CELL + STREET / 2;
    const bz = ORIGIN + gz * CELL + STREET / 2;

    // Central plaza (2×2 block area)
    if (gx >= 3 && gx <= 4 && gz >= 3 && gz <= 4) {
      this._makePlaza(bx, bz, gx, gz);
      return;
    }

    const depth = 9;

    // North face (buildings along z = bz edge, extending into block)
    this._buildingRow(bx, bz, BLOCK, 0, depth);

    // South face
    this._buildingRow(bx, bz + BLOCK - depth, BLOCK, 0, depth);

    // West face (avoid double-building corners)
    this._buildingRow(bx, bz + depth, BLOCK - 2 * depth, 1, depth);

    // East face
    this._buildingRow(bx + BLOCK - depth, bz + depth, BLOCK - 2 * depth, 1, depth);

    // Spawn point: center of interior courtyard
    this.spawnPts.push(new THREE.Vector3(bx + BLOCK / 2, 0, bz + BLOCK / 2));
  }

  // dir: 0 = along X, 1 = along Z
  _buildingRow(startX, startZ, length, dir, depth) {
    const rng = this.rng;
    let cursor = 0;
    while (cursor < length - 4) {
      const w     = rng.rf(7, Math.min(16, length - cursor - 1));
      const h     = rng.rf(9, 32);
      const gap   = rng.rf(0.5, 2.5);
      cursor += gap;
      if (cursor + w > length) break;

      let mx, mz, bw, bd;
      if (dir === 0) { mx = startX + cursor; mz = startZ; bw = w; bd = depth; }
      else           { mx = startX; mz = startZ + cursor; bw = depth; bd = w; }

      this._addBuilding(mx, mz, bw, h, bd);
      cursor += w;
    }
  }

  _addBuilding(x, z, w, h, d) {
    const colors = [0xe8d5a3, 0xd4956a, 0xc8b89a, 0xe2c98a, 0xcc8855, 0xddd0b0, 0xb8997a, 0xe8e0c8];
    const col = this.rng.pick(colors);
    const mat = new THREE.MeshLambertMaterial({ color: col });
    const geo = new THREE.BoxGeometry(w, h, d);
    const m   = new THREE.Mesh(geo, mat);
    m.position.set(x + w / 2, h / 2, z + d / 2);
    m.castShadow = true;
    m.receiveShadow = true;
    this.scene.add(m);

    // Add lit window sprites
    this._addWindows(x, z, w, h, d, col);

    this.physics.addBox(x, z, x + w, z + d);
  }

  _addWindows(bx, bz, bw, bh, bd, baseCol) {
    if (bw < 6 && bd < 6) return;
    const mat = new THREE.MeshLambertMaterial({
      color: 0xffdd88, emissive: 0xffaa44, emissiveIntensity: this.rng.rf(0.3, 1.0),
    });
    const floors = Math.floor(bh / 4);
    for (let f = 1; f < floors; f++) {
      const y = f * 4 - 0.5;
      if (this.rng.rand() < 0.6) {
        const wx = bx + bw / 2; const wz = bz;
        const wg = new THREE.PlaneGeometry(1.2, 1.6);
        const wm = new THREE.Mesh(wg, mat);
        wm.position.set(wx, y, wz - 0.01);
        this.scene.add(wm);
      }
    }
  }

  _makePlaza(bx, bz, gx, gz) {
    // Concrete plaza
    const mat  = new THREE.MeshLambertMaterial({ color: 0xbbbbbb });
    const geo  = new THREE.PlaneGeometry(BLOCK, BLOCK);
    const base = new THREE.Mesh(geo, mat);
    base.rotation.x = -Math.PI / 2;
    base.position.set(bx + BLOCK / 2, 0.02, bz + BLOCK / 2);
    this.scene.add(base);

    // Add fountain at centre of the full plaza (only do once at gx=3,gz=3)
    if (gx === 3 && gz === 3) {
      const cx = ORIGIN + 3.5 * CELL + STREET / 2;
      const cz = ORIGIN + 3.5 * CELL + STREET / 2;
      this._addFountain(cx, cz);
      // Some benches
      for (let a = 0; a < 4; a++) {
        const angle = (a / 4) * Math.PI * 2;
        const bx2 = cx + Math.cos(angle) * 14;
        const bz2 = cz + Math.sin(angle) * 14;
        this._addBench(bx2, bz2, angle);
      }
    }

    this.spawnPts.push(new THREE.Vector3(bx + BLOCK / 2, 0, bz + BLOCK / 2));
  }

  _addFountain(cx, cz) {
    const baseMat = new THREE.MeshLambertMaterial({ color: 0xcccccc });
    // Base disk
    const bg = new THREE.CylinderGeometry(6, 6.5, 0.8, 16);
    const bm = new THREE.Mesh(bg, baseMat);
    bm.position.set(cx, 0.4, cz);
    this.scene.add(bm);
    // Inner column
    const cg = new THREE.CylinderGeometry(1, 1.2, 3, 12);
    const cm = new THREE.Mesh(cg, baseMat);
    cm.position.set(cx, 1.5, cz);
    this.scene.add(cm);
    this.physics.addBox(cx - 6.5, cz - 6.5, cx + 6.5, cz + 6.5);
  }

  _addBench(x, z, angle) {
    const mat = new THREE.MeshLambertMaterial({ color: 0x4a3520 });
    const sg = new THREE.BoxGeometry(3.5, 0.3, 0.8);
    const sm = new THREE.Mesh(sg, mat);
    sm.position.set(x, 0.6, z);
    sm.rotation.y = angle;
    this.scene.add(sm);
  }

  _makeProps() {
    const rng = this.rng;
    // Parked cars along streets
    for (let i = 0; i < 60; i++) {
      const gx = rng.ri(0, GRID - 1);
      const gz = rng.ri(0, GRID - 1);
      // Place along north side of block's street
      const bx = ORIGIN + gx * CELL;
      const bz = ORIGIN + gz * CELL;
      const side = rng.ri(0, 3);
      let cx, cz, rot;
      if (side === 0) { cx = bx + rng.rf(4, 14); cz = bz + 5; rot = 0; }
      else if (side === 1) { cx = bx + CELL - 5; cz = bz + rng.rf(4, 14); rot = Math.PI / 2; }
      else if (side === 2) { cx = bx + rng.rf(4, 14); cz = bz + CELL - 5; rot = 0; }
      else { cx = bx + 5; cz = bz + rng.rf(4, 14); rot = Math.PI / 2; }
      this._addCar(cx, cz, rot);
    }

    // Dumpsters
    for (let i = 0; i < 30; i++) {
      const x = ORIGIN + rng.rf(0, GRID * CELL);
      const z = ORIGIN + rng.rf(0, GRID * CELL);
      if (!this.physics.overlaps(x, z, 3)) this._addDumpster(x, z);
    }

    // Concrete barriers (cover)
    for (let i = 0; i < 20; i++) {
      const gx = rng.ri(0, GRID - 1);
      const gz = rng.ri(0, GRID - 1);
      const bx = ORIGIN + gx * CELL + STREET / 2 + 10;
      const bz = ORIGIN + gz * CELL + STREET / 2 + 10;
      if (!this.physics.overlaps(bx, bz, 4)) this._addBarrier(bx, bz, rng.rand() > 0.5 ? Math.PI / 2 : 0);
    }
  }

  _addCar(x, z, rot) {
    const g = new THREE.Group();
    const colors = [0x334488, 0x883333, 0x228833, 0x888888, 0x222255, 0xaaaa33, 0xaa4422];
    const bodyCol = this.rng.pick(colors);

    const bodyG = new THREE.BoxGeometry(4.6, 1.4, 2.2);
    const bodyM = new THREE.MeshLambertMaterial({ color: bodyCol });
    const body  = new THREE.Mesh(bodyG, bodyM);
    body.position.y = 0.8;
    g.add(body);

    const roofG = new THREE.BoxGeometry(2.4, 0.9, 2.0);
    const roofM = new THREE.MeshLambertMaterial({ color: darken(bodyCol, 0.6) });
    const roof  = new THREE.Mesh(roofG, roofM);
    roof.position.y = 1.9;
    g.add(roof);

    const wMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
    [[1.5, 1.2], [1.5, -1.2], [-1.5, 1.2], [-1.5, -1.2]].forEach(([wx, wz]) => {
      const wg = new THREE.CylinderGeometry(0.38, 0.38, 0.28, 8);
      const wm = new THREE.Mesh(wg, wMat);
      wm.rotation.z = Math.PI / 2;
      wm.position.set(wx, 0.38, wz);
      g.add(wm);
    });

    g.position.set(x, 0, z);
    g.rotation.y = rot;
    this.scene.add(g);

    // AABB (rotated rectangle → use conservative circle-ish box)
    const hw = 2.5, hd = 1.2;
    const cos = Math.abs(Math.cos(rot)), sin = Math.abs(Math.sin(rot));
    const rx = hw * cos + hd * sin, rz = hw * sin + hd * cos;
    this.physics.addBox(x - rx, z - rz, x + rx, z + rz);
  }

  _addDumpster(x, z) {
    const mat = new THREE.MeshLambertMaterial({ color: 0x2d6e3e });
    const geo = new THREE.BoxGeometry(2.4, 1.4, 1.2);
    const m   = new THREE.Mesh(geo, mat);
    m.position.set(x, 0.7, z);
    this.scene.add(m);
    this.physics.addBox(x - 1.2, z - 0.6, x + 1.2, z + 0.6);
  }

  _addBarrier(x, z, rot) {
    const mat = new THREE.MeshLambertMaterial({ color: 0x999999 });
    const geo = new THREE.BoxGeometry(3.2, 1.0, 0.9);
    const m   = new THREE.Mesh(geo, mat);
    m.position.set(x, 0.5, z);
    m.rotation.y = rot;
    this.scene.add(m);
    this.physics.addBox(x - 1.8, z - 1.8, x + 1.8, z + 1.8);
  }

  _makeLampPosts() {
    for (let gx = 0; gx <= GRID; gx++) {
      for (let gz = 0; gz <= GRID; gz++) {
        const bx = ORIGIN + gx * CELL;
        const bz = ORIGIN + gz * CELL;
        this._addLampPost(bx + STREET / 2 - 1, bz + STREET / 2 - 1);
      }
    }
  }

  _addLampPost(x, z) {
    const g    = new THREE.Group();
    const pMat = new THREE.MeshLambertMaterial({ color: 0x444444 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 9, 6), pMat);
    pole.position.y = 4.5;
    g.add(pole);

    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.2, 0.2), pMat);
    arm.position.set(0.8, 9.1, 0);
    g.add(arm);

    const bulbMat = new THREE.MeshStandardMaterial({ color: 0xffbb55, emissive: 0xffbb55, emissiveIntensity: 2 });
    const bulb    = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 6), bulbMat);
    bulb.position.set(1.5, 9.0, 0);
    g.add(bulb);

    const light = new THREE.PointLight(0xff9933, 6, 22, 1.5);
    light.position.set(1.5, 8.8, 0);
    g.add(light);

    g.position.set(x, 0, z);
    this.scene.add(g);
  }

  getSpawnPoints() { return this.spawnPts; }

  getPlayerSpawn() { return new THREE.Vector3(0, 0, MAP_HALF - CELL); }
}

// ── HELPERS ────────────────────────────────────────────────
function darken(hex, factor) {
  const r = ((hex >> 16) & 0xff) * factor;
  const g = ((hex >>  8) & 0xff) * factor;
  const b = ( hex        & 0xff) * factor;
  return (r << 16) | (g << 8) | b;
}

function lerp(a, b, t) { return a + (b - a) * t; }

function lerpAngle(a, b, t) {
  let d = b - a;
  while (d >  Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

// ── CHARACTER BASE ──────────────────────────────────────────
class Character {
  constructor(scene, teamKey) {
    this.scene    = scene;
    this.teamKey  = teamKey;
    this.health   = 100;
    this.maxHp    = 100;
    this.stamina  = 100;
    this.alive    = true;
    this.downed   = false;
    this.stunTimer = 0;

    this.vel   = new THREE.Vector3();
    this.rot   = 0;   // Y rotation (radians)
    this.walkCycle = 0;
    this.hitFlashTimer = 0;

    this.group = new THREE.Group();
    this._buildMesh(teamKey);
    scene.add(this.group);
  }

  _buildMesh(teamKey) {
    const td = TEAM_DATA[teamKey];
    const skinCol    = 0xd4956a;
    const jerseyMat  = new THREE.MeshLambertMaterial({ color: td.jerseyColor });
    const shortMat   = new THREE.MeshLambertMaterial({ color: td.shortColor });
    const skinMat    = new THREE.MeshLambertMaterial({ color: skinCol });

    // Torso
    this.torso = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.9, 0.48), jerseyMat);
    this.torso.position.y = 1.05;
    this.group.add(this.torso);

    // Head
    this.head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 6), skinMat);
    this.head.position.y = 1.74;
    this.group.add(this.head);

    // Scarf (team accent)
    const scarfMat = new THREE.MeshLambertMaterial({ color: td.accentColor });
    const scarf    = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.06, 4, 8), scarfMat);
    scarf.rotation.x = Math.PI / 2;
    scarf.position.y = 1.55;
    this.group.add(scarf);

    // Arms
    const armGeo = new THREE.BoxGeometry(0.22, 0.72, 0.22);
    this.armL = new THREE.Mesh(armGeo, jerseyMat);
    this.armL.position.set(-0.52, 1.05, 0);
    this.group.add(this.armL);

    this.armR = new THREE.Mesh(armGeo, jerseyMat);
    this.armR.position.set(0.52, 1.05, 0);
    this.group.add(this.armR);

    // Fists
    const fistMat = new THREE.MeshLambertMaterial({ color: skinCol });
    this.fistL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), fistMat);
    this.fistL.position.set(-0.52, 0.65, 0);
    this.group.add(this.fistL);

    this.fistR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), fistMat);
    this.fistR.position.set(0.52, 0.65, 0);
    this.group.add(this.fistR);

    // Legs
    const legGeo = new THREE.BoxGeometry(0.28, 0.78, 0.28);
    this.legL = new THREE.Mesh(legGeo, shortMat);
    this.legL.position.set(-0.22, 0.39, 0);
    this.group.add(this.legL);

    this.legR = new THREE.Mesh(legGeo, shortMat);
    this.legR.position.set(0.22, 0.39, 0);
    this.group.add(this.legR);

    // Shoes
    const shoeMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
    this.shoeL = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.2, 0.38), shoeMat);
    this.shoeL.position.set(-0.22, 0.06, 0.05);
    this.group.add(this.shoeL);

    this.shoeR = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.2, 0.38), shoeMat);
    this.shoeR.position.set(0.22, 0.06, 0.05);
    this.group.add(this.shoeR);

    // Hit flash material swap list
    this._allMeshes = [this.torso, this.head, this.armL, this.armR,
                       this.legL, this.legR, this.fistL, this.fistR];
    this._origMats  = this._allMeshes.map(m => m.material);
    this._flashMat  = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1 });
  }

  get position() { return this.group.position; }

  takeDamage(amount, knockDir) {
    if (this.downed) return;
    this.health = Math.max(0, this.health - amount);
    this.stunTimer = 0.45;
    this.hitFlashTimer = 0.12;

    if (knockDir) {
      const kd = knockDir.clone().normalize().multiplyScalar(3.5);
      this.vel.x += kd.x;
      this.vel.z += kd.z;
    }

    if (this.health <= 0) this._knockDown();
  }

  _knockDown() {
    this.downed = true;
    this.alive  = false;
    this.group.rotation.x = -Math.PI / 2;
    this.group.position.y = 0.35;
  }

  _animate(dt, speed) {
    if (this.downed) return;

    const moving = speed > 0.5;
    if (moving) this.walkCycle += dt * speed * 3.5;

    const swing = moving ? Math.sin(this.walkCycle) * 0.5 : 0;
    this.legL.rotation.x  =  swing;
    this.legR.rotation.x  = -swing;
    this.armL.rotation.x  = -swing * 0.8;
    this.armR.rotation.x  =  swing * 0.8;

    // Body bob
    const bob = moving ? Math.abs(Math.sin(this.walkCycle)) * 0.04 : 0;
    this.torso.position.y = 1.05 + bob;
    this.head.position.y  = 1.74 + bob;

    // Hit flash
    if (this.hitFlashTimer > 0) {
      this.hitFlashTimer -= dt;
      this._allMeshes.forEach(m => { m.material = this._flashMat; });
    } else {
      this._allMeshes.forEach((m, i) => { m.material = this._origMats[i]; });
    }
  }

  // Punch animation: drive right arm forward
  _punchAnim(progress) {
    // progress 0→1→0
    const ext = Math.sin(progress * Math.PI);
    this.armR.rotation.x  = -ext * 1.2;
    this.fistR.position.z =  ext * 0.5;
  }

  _heavyAnim(progress) {
    const ext = Math.sin(progress * Math.PI);
    this.armL.rotation.x  = -ext * 1.5;
    this.armR.rotation.x  = -ext * 0.8;
    this.fistL.position.z =  ext * 0.7;
  }

  destroy() {
    this.scene.remove(this.group);
  }
}

// ── PLAYER ─────────────────────────────────────────────────
class Player extends Character {
  constructor(scene, teamKey, physics) {
    super(scene, teamKey, physics);
    this.physics   = physics;
    this.inventory = { molotov: 3 };
    this.facingDir = new THREE.Vector3(0, 0, -1);
    this.attackTimer   = 0;
    this.attackDur     = 0;
    this.attackType    = null;
    this.throwCooldown = 0;
    this.runStamina    = 100;
  }

  update(dt, controls, enemies, effects) {
    if (this.downed) return;

    const mv   = controls.move;
    const speed = this._calcSpeed(dt, mv, controls.run);

    // Movement direction (based on camera yaw from controls)
    const camY = controls.cameraYaw;
    const fwd  = new THREE.Vector3(
      mv.x * Math.cos(camY) + mv.z * Math.sin(camY),
      0,
      -mv.x * Math.sin(camY) + mv.z * Math.cos(camY)
    );

    if (fwd.lengthSq() > 0.01) {
      fwd.normalize();
      this.facingDir.lerp(fwd, 0.25).normalize();
      this.rot = lerpAngle(this.rot, Math.atan2(fwd.x, fwd.z), 0.2);
    }

    this.physics.move(this.position, fwd.x * speed * dt, fwd.z * speed * dt, CHAR_RADIUS);
    this.group.rotation.y = this.rot;

    // Stun
    if (this.stunTimer > 0) { this.stunTimer -= dt; }

    // Attack cooldown
    if (this.attackTimer > 0) {
      this.attackTimer -= dt;
      const prog = 1 - this.attackTimer / this.attackDur;
      if (this.attackType === 'punch') this._punchAnim(prog);
      else                             this._heavyAnim(prog);
    }

    // Throw cooldown
    if (this.throwCooldown > 0) this.throwCooldown -= dt;

    // Stamina regen
    if (speed < RUN_SPEED - 0.5) {
      this.runStamina = Math.min(100, this.runStamina + 20 * dt);
    }

    // Process button presses
    if (controls.consumePunch && this.attackTimer <= 0 && this.stunTimer <= 0) {
      this._doPunch(enemies, effects, false);
    }
    if (controls.consumeHeavy && this.attackTimer <= 0 && this.stunTimer <= 0) {
      this._doPunch(enemies, effects, true);
    }
    if (controls.consumeThrow && this.throwCooldown <= 0 && this.inventory.molotov > 0) {
      this._throwMolotov(effects);
    }

    this._animate(dt, fwd.lengthSq() > 0.01 ? speed : 0);
  }

  _calcSpeed(dt, mv, running) {
    const moving = mv.x !== 0 || mv.z !== 0;
    if (!moving) return 0;
    if (running && this.runStamina > 5) {
      this.runStamina = Math.max(0, this.runStamina - 22 * dt);
      return RUN_SPEED;
    }
    return PLAYER_SPEED;
  }

  _doPunch(enemies, effects, heavy) {
    this.attackTimer = heavy ? 0.85 : 0.45;
    this.attackDur   = this.attackTimer;
    this.attackType  = heavy ? 'heavy' : 'punch';

    const dmg  = heavy ? 32 : 16;
    const kb   = heavy ? 5  : 2.5;
    const range = MELEE_RANGE + (heavy ? 0.5 : 0);

    let hit = false;
    for (const e of enemies) {
      if (!e.alive || e.downed) continue;
      const d = this.position.distanceTo(e.position);
      if (d > range) continue;

      // Check that enemy is roughly in front of player
      const toEnemy = e.position.clone().sub(this.position).normalize();
      const dot = this.facingDir.dot(toEnemy);
      if (dot < 0.25) continue;

      const knockDir = toEnemy.clone().multiplyScalar(kb);
      e.takeDamage(dmg, knockDir);
      effects.spawnImpact(e.position.clone().add(new THREE.Vector3(0, 1.2, 0)));
      AUDIO.playHit();
      hit = true;
    }
    if (!hit && heavy) AUDIO.playSwing();
  }

  _throwMolotov(effects) {
    if (this.inventory.molotov <= 0) return;
    this.inventory.molotov--;
    this.throwCooldown = 1.2;

    const origin = this.position.clone().add(new THREE.Vector3(0, 1.8, 0));
    const throwDir = new THREE.Vector3(
      this.facingDir.x,
      0.4,
      this.facingDir.z
    ).normalize().multiplyScalar(14);

    effects.spawnMolotov(origin, throwDir);
    AUDIO.playThrow();
  }
}

// ── ENEMY AI ───────────────────────────────────────────────
class Enemy extends Character {
  constructor(scene, teamKey, physics, player) {
    super(scene, teamKey, physics);
    this.physics     = physics;
    this.player      = player;
    this.state       = 'patrol';
    this.patrolTimer = 0;
    this.patrolDir   = new THREE.Vector3(1, 0, 0);
    this.attackTimer = 0;
    this.alertTimer  = 0;
    this.groupRef    = null;
    this.health      = 60;
    this.maxHp       = 60;
  }

  setPosition(x, y, z) {
    this.group.position.set(x, y, z);
    return this;
  }

  update(dt, allEnemies) {
    if (this.downed) return;

    if (this.stunTimer > 0) {
      this.stunTimer -= dt;
      this._animate(dt, 0);
      return;
    }

    const player = this.player;
    const dist   = this.position.distanceTo(player.position);

    switch (this.state) {
      case 'patrol': this._patrol(dt, dist); break;
      case 'chase':  this._chase(dt, dist, player); break;
      case 'attack': this._attack(dt, dist, player); break;
    }

    // Group alert contagion
    if (this.state !== 'patrol' && this.groupRef) {
      this.groupRef.forEach(e => {
        if (e !== this && e.state === 'patrol') e.state = 'chase';
      });
    }

    // Separate from other enemies (soft push)
    for (const other of allEnemies) {
      if (other === this || other.downed) continue;
      const sep = this.position.clone().sub(other.position);
      const d   = sep.length();
      if (d < ENEMY_ENEMY_PUSH && d > 0.01) {
        sep.normalize().multiplyScalar((ENEMY_ENEMY_PUSH - d) * 0.5);
        this.position.x += sep.x;
        this.position.z += sep.z;
      }
    }

    this.group.rotation.y = this.rot;
  }

  _patrol(dt, dist) {
    if (dist < AGGRO_RANGE) { this.state = 'chase'; return; }

    this.patrolTimer -= dt;
    if (this.patrolTimer <= 0) {
      const a = Math.random() * Math.PI * 2;
      this.patrolDir.set(Math.sin(a), 0, Math.cos(a));
      this.patrolTimer = 1.5 + Math.random() * 2;
    }

    const speed = ENEMY_SPEED * 0.4;
    this.physics.move(this.position, this.patrolDir.x * speed * dt, this.patrolDir.z * speed * dt, CHAR_RADIUS);
    this.rot = lerpAngle(this.rot, Math.atan2(this.patrolDir.x, this.patrolDir.z), 0.1);
    this._animate(dt, speed);
  }

  _chase(dt, dist, player) {
    if (dist < ATTACK_RANGE) { this.state = 'attack'; return; }

    const toPlayer = player.position.clone().sub(this.position).normalize();
    this.physics.move(this.position, toPlayer.x * ENEMY_SPEED * dt, toPlayer.z * ENEMY_SPEED * dt, CHAR_RADIUS);
    this.rot = lerpAngle(this.rot, Math.atan2(toPlayer.x, toPlayer.z), 0.15);
    this._animate(dt, ENEMY_SPEED);
  }

  _attack(dt, dist, player) {
    if (dist > ATTACK_RANGE * 1.8) { this.state = 'chase'; return; }

    this.attackTimer -= dt;
    if (this.attackTimer <= 0) {
      this.attackTimer = 1.2 + Math.random() * 0.6;
      if (!player.downed) {
        player.takeDamage(9, this.position.clone().sub(player.position).negate().normalize());
      }
      this._punchAnim(0.6);
    }
    this._animate(dt, 0);
  }
}

// ── EFFECTS (projectiles, fire, particles) ──────────────────
class Effects {
  constructor(scene) {
    this.scene       = scene;
    this.projectiles = [];
    this.fires       = [];
    this.particles   = [];
  }

  spawnMolotov(origin, velocity) {
    // Bottle mesh
    const g      = new THREE.Group();
    const bottle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.18, 0.55, 8),
      new THREE.MeshLambertMaterial({ color: 0x44aa66, transparent: true, opacity: 0.8 })
    );
    g.add(bottle);
    const neck = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.12, 0.18, 6),
      new THREE.MeshLambertMaterial({ color: 0x44aa66, transparent: true, opacity: 0.8 })
    );
    neck.position.y = 0.35;
    g.add(neck);
    g.position.copy(origin);
    this.scene.add(g);

    this.projectiles.push({ mesh: g, vel: velocity.clone(), life: 5 });
  }

  spawnImpact(position) {
    for (let i = 0; i < 8; i++) {
      const angle  = Math.random() * Math.PI * 2;
      const speed  = 2 + Math.random() * 3;
      const upVel  = 2 + Math.random() * 2;
      const size   = 0.12 + Math.random() * 0.14;
      const geo    = new THREE.SphereGeometry(size, 4, 4);
      const mat    = new THREE.MeshLambertMaterial({ color: 0xddddaa });
      const mesh   = new THREE.Mesh(geo, mat);
      mesh.position.copy(position);
      this.scene.add(mesh);
      this.particles.push({
        mesh,
        vel: new THREE.Vector3(Math.cos(angle) * speed, upVel, Math.sin(angle) * speed),
        life: 0.3 + Math.random() * 0.2,
        maxLife: 0.5,
        type: 'dust',
      });
    }
  }

  _spawnFire(position) {
    const group  = new THREE.Group();
    const radius = 4.5;

    // Glow disk on ground
    const diskG = new THREE.CircleGeometry(radius, 16);
    const diskM = new THREE.MeshLambertMaterial({ color: 0xff4400, transparent: true, opacity: 0.55 });
    const disk  = new THREE.Mesh(diskG, diskM);
    disk.rotation.x = -Math.PI / 2;
    disk.position.y = 0.05;
    group.add(disk);

    // Fire columns (billboard quads driven by update)
    const flames = [];
    for (let i = 0; i < 18; i++) {
      const angle = (i / 18) * Math.PI * 2 + Math.random() * 0.5;
      const r     = Math.random() * radius * 0.8;
      const h     = 1.5 + Math.random() * 3;
      const fg    = new THREE.PlaneGeometry(0.9 + Math.random() * 0.6, h);
      const fm    = new THREE.MeshLambertMaterial({
        color: Math.random() > 0.5 ? 0xff6600 : 0xff2200,
        transparent: true, opacity: 0.85, side: THREE.DoubleSide,
      });
      const fm2  = new THREE.Mesh(fg, fm);
      fm2.position.set(Math.cos(angle) * r, h / 2, Math.sin(angle) * r);
      fm2.rotation.y = angle + Math.PI / 2;
      fm2._baseH   = h;
      fm2._phase   = Math.random() * Math.PI * 2;
      fm2._speed   = 3 + Math.random() * 3;
      group.add(fm2);
      flames.push(fm2);
    }

    group.position.copy(position);
    group.position.y = 0;
    this.scene.add(group);

    // Point light for fire
    const fireLight = new THREE.PointLight(0xff4400, 10, 14, 1.5);
    fireLight.position.copy(position);
    fireLight.position.y = 2;
    this.scene.add(fireLight);

    AUDIO.playFire();

    this.fires.push({
      group, flames, light: fireLight,
      position: position.clone(),
      radius,
      life: 10,
      maxLife: 10,
      disk, diskM,
      phase: Math.random() * Math.PI * 2,
    });
  }

  update(dt, player, enemies) {
    // Projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.vel.y -= 9.8 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.rotation.x += dt * 4;
      p.mesh.rotation.z += dt * 3;
      p.life -= dt;

      if (p.mesh.position.y <= 0.1 || p.life <= 0) {
        const landPos = p.mesh.position.clone();
        landPos.y = 0;
        this.scene.remove(p.mesh);
        this.projectiles.splice(i, 1);
        this._spawnFire(landPos);
        // Screen shake hint
        if (window.GAME) window.GAME.screenShake(0.3);
      }
    }

    // Fire
    const t = Date.now() * 0.001;
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const f = this.fires[i];
      f.life -= dt;
      const ratio = f.life / f.maxLife;
      f.diskM.opacity = 0.55 * ratio;
      f.light.intensity = 10 * ratio;

      f.flames.forEach(fl => {
        const wave = Math.sin(t * fl._speed + fl._phase) * 0.15;
        fl.scale.x = 1 + wave;
        fl.material.opacity = (0.7 + Math.sin(t * fl._speed * 1.3 + fl._phase) * 0.2) * ratio;
        fl.rotation.y += dt * 0.5;
      });

      // Damage entities in fire
      const dmgPerSec = 6;
      if (player && !player.downed) {
        if (f.position.distanceTo(player.position) < f.radius) {
          player.takeDamage(dmgPerSec * dt, null);
          if (window.GAME) window.GAME.triggerHitFlash();
        }
      }
      for (const e of enemies) {
        if (e.alive && !e.downed) {
          if (f.position.distanceTo(e.position) < f.radius) {
            e.takeDamage(dmgPerSec * dt, null);
          }
        }
      }

      if (f.life <= 0) {
        this.scene.remove(f.group);
        this.scene.remove(f.light);
        this.fires.splice(i, 1);
      }
    }

    // Particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.vel.y -= 12 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.life -= dt;
      const scale = p.life / p.maxLife;
      p.mesh.scale.setScalar(scale);
      p.mesh.material.opacity = scale;
      p.mesh.material.transparent = true;
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        this.particles.splice(i, 1);
      }
    }
  }

  clear() {
    [...this.projectiles, ...this.fires, ...this.particles].forEach(p => {
      this.scene.remove(p.mesh || p.group);
      if (p.light) this.scene.remove(p.light);
    });
    this.projectiles = [];
    this.fires = [];
    this.particles = [];
  }
}

// ── TOUCH / KEYBOARD CONTROLS ──────────────────────────────
class Controls {
  constructor() {
    this.move        = { x: 0, z: 0 };
    this.run         = false;
    this.cameraYaw   = 0;  // radians
    this.consumePunch = false;
    this.consumeHeavy = false;
    this.consumeThrow = false;

    // Joystick state
    this._joyActive  = false;
    this._joyTouchId = null;
    this._joyCenter  = { x: 0, y: 0 };
    this._maxRadius  = 44;

    // Camera drag state
    this._camTouchId = null;
    this._camLastX   = 0;

    // Keyboard state
    this._keys = {};

    this._setupDOM();
    this._setupListeners();
  }

  _setupDOM() {
    this._joyBase  = document.getElementById('joy-base');
    this._joyKnob  = document.getElementById('joy-knob');
    const punch    = document.getElementById('btn-punch');
    const heavy    = document.getElementById('btn-heavy');
    const throwBtn = document.getElementById('btn-throw');

    punch.addEventListener('touchstart', e => { e.preventDefault(); this.consumePunch = true; }, { passive: false });
    heavy.addEventListener('touchstart', e => { e.preventDefault(); this.consumeHeavy = true; }, { passive: false });
    throwBtn.addEventListener('touchstart', e => { e.preventDefault(); this.consumeThrow = true; }, { passive: false });

    // Mouse fallbacks for desktop testing
    punch.addEventListener('mousedown', () => { this.consumePunch = true; });
    heavy.addEventListener('mousedown', () => { this.consumeHeavy = true; });
    throwBtn.addEventListener('mousedown', () => { this.consumeThrow = true; });
  }

  _setupListeners() {
    const joyZone = document.getElementById('joystick-zone');
    const camZone = document.getElementById('cam-zone');

    joyZone.addEventListener('touchstart', e => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (this._joyTouchId !== null) continue;
        this._joyTouchId = t.identifier;
        this._joyCenter  = { x: t.clientX, y: t.clientY };
        this._joyActive  = true;
        this._joyBase.style.display = 'block';
        this._joyBase.style.left    = t.clientX + 'px';
        this._joyBase.style.top     = t.clientY + 'px';
      }
    }, { passive: false });

    joyZone.addEventListener('touchmove', e => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier !== this._joyTouchId) continue;
        const dx = t.clientX - this._joyCenter.x;
        const dy = t.clientY - this._joyCenter.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const clamped = Math.min(dist, this._maxRadius);
        const nx = dx / dist || 0, ny = dy / dist || 0;

        this.move.x = nx * (clamped / this._maxRadius);
        this.move.z = ny * (clamped / this._maxRadius);
        this.run    = dist > this._maxRadius * 0.65;

        const kx = nx * Math.min(dist, this._maxRadius);
        const ky = ny * Math.min(dist, this._maxRadius);
        this._joyKnob.style.transform = `translate(calc(-50% + ${kx}px), calc(-50% + ${ky}px))`;
      }
    }, { passive: false });

    const joyEnd = e => {
      for (const t of e.changedTouches) {
        if (t.identifier !== this._joyTouchId) continue;
        this._joyTouchId = null;
        this._joyActive  = false;
        this.move.x = 0; this.move.z = 0; this.run = false;
        this._joyBase.style.display = 'none';
        this._joyKnob.style.transform = 'translate(-50%,-50%)';
      }
    };
    joyZone.addEventListener('touchend', joyEnd, { passive: false });
    joyZone.addEventListener('touchcancel', joyEnd, { passive: false });

    // Camera drag
    camZone.addEventListener('touchstart', e => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (this._camTouchId !== null) continue;
        this._camTouchId = t.identifier;
        this._camLastX   = t.clientX;
      }
    }, { passive: false });

    camZone.addEventListener('touchmove', e => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier !== this._camTouchId) continue;
        const delta = t.clientX - this._camLastX;
        this.cameraYaw -= delta * 0.008;
        this._camLastX = t.clientX;
      }
    }, { passive: false });

    const camEnd = e => {
      for (const t of e.changedTouches)
        if (t.identifier === this._camTouchId) this._camTouchId = null;
    };
    camZone.addEventListener('touchend', camEnd, { passive: false });
    camZone.addEventListener('touchcancel', camEnd, { passive: false });

    // Keyboard (desktop)
    window.addEventListener('keydown', e => {
      this._keys[e.code] = true;
      if (e.code === 'KeyZ') this.consumePunch = true;
      if (e.code === 'KeyX') this.consumeHeavy = true;
      if (e.code === 'KeyC') this.consumeThrow = true;
    });
    window.addEventListener('keyup', e => { this._keys[e.code] = false; });
  }

  updateKeyboard() {
    const k = this._keys;
    if (!this._joyActive) {
      this.move.x = (k['KeyD'] || k['ArrowRight'] ? 1 : 0) - (k['KeyA'] || k['ArrowLeft'] ? 1 : 0);
      this.move.z = (k['KeyS'] || k['ArrowDown']  ? 1 : 0) - (k['KeyW'] || k['ArrowUp']   ? 1 : 0);
      this.run    = k['ShiftLeft'] || k['ShiftRight'];
    }
    if (k['KeyQ']) this.cameraYaw += 0.02;
    if (k['KeyE']) this.cameraYaw -= 0.02;
  }

  flush() {
    this.consumePunch = false;
    this.consumeHeavy = false;
    this.consumeThrow = false;
  }
}

// ── MINI MAP ───────────────────────────────────────────────
class MiniMap {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
    this.size   = canvas.width;
    this.scale  = this.size / (MAP_HALF * 2);
  }

  _toMap(wx, wz) {
    return {
      x: (wx + MAP_HALF) * this.scale,
      y: (wz + MAP_HALF) * this.scale,
    };
  }

  draw(player, enemies) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.size, this.size);

    // Background
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.fillRect(0, 0, this.size, this.size);

    // Grid roads
    ctx.strokeStyle = '#222';
    ctx.lineWidth   = 1;
    for (let i = 0; i <= GRID; i++) {
      const c = i * CELL * this.scale;
      ctx.beginPath(); ctx.moveTo(c, 0); ctx.lineTo(c, this.size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, c); ctx.lineTo(this.size, c); ctx.stroke();
    }

    // Dead enemies (gray)
    for (const e of enemies) {
      if (e.alive) continue;
      const p = this._toMap(e.position.x, e.position.z);
      ctx.fillStyle = '#333';
      ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, Math.PI * 2); ctx.fill();
    }

    // Live enemies (red)
    for (const e of enemies) {
      if (!e.alive) continue;
      const p = this._toMap(e.position.x, e.position.z);
      ctx.fillStyle = '#ff3333';
      ctx.beginPath(); ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2); ctx.fill();
    }

    // Player (white triangle indicating facing)
    const pp = this._toMap(player.position.x, player.position.z);
    ctx.save();
    ctx.translate(pp.x, pp.y);
    ctx.rotate(player.rot + Math.PI);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(0, -5); ctx.lineTo(-3, 3); ctx.lineTo(3, 3);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}

// ── AUDIO (Web Audio API, procedural) ──────────────────────
const AUDIO = (() => {
  let ctx = null;
  let unlocked = false;

  function unlock() {
    if (unlocked) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    unlocked = true;
  }

  document.addEventListener('touchstart', unlock, { once: true });
  document.addEventListener('mousedown',  unlock, { once: true });

  function noise(dur, freq, type = 'sawtooth', vol = 0.3) {
    if (!ctx) return;
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type      = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.3, ctx.currentTime + dur);
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + dur);
  }

  return {
    playHit()   { noise(0.12, 180, 'sawtooth', 0.25); },
    playSwing() { noise(0.08, 320, 'sine',     0.12); },
    playThrow() { noise(0.18, 260, 'triangle', 0.22); },
    playFire()  { noise(0.6,  80,  'sawtooth', 0.18); },
    playDead()  { noise(0.4,  120, 'square',   0.3);  },
  };
})();

// ── HUD UPDATER ────────────────────────────────────────────
class HUD {
  constructor() {
    this.healthFill  = document.getElementById('health-fill');
    this.staminaFill = document.getElementById('stamina-fill');
    this.molCnt      = document.getElementById('mol-cnt');
    this.enemyCount  = document.getElementById('enemy-counter');
    this.teamBanner  = document.getElementById('team-banner');
    this.objective   = document.getElementById('objective');
    this._objTimer   = 4;
  }

  update(dt, player, enemies) {
    this.healthFill.style.width  = (player.health / player.maxHp * 100) + '%';
    this.staminaFill.style.width = (player.runStamina) + '%';
    this.molCnt.textContent      = '×' + player.inventory.molotov;

    const alive = enemies.filter(e => e.alive).length;
    this.enemyCount.textContent  = 'ENEMIES: ' + alive;

    if (this._objTimer > 0) {
      this._objTimer -= dt;
      if (this._objTimer <= 0) this.objective.style.opacity = '0';
    }
  }

  setTeam(teamKey) {
    const td = TEAM_DATA[teamKey];
    this.teamBanner.textContent = td.name;
    if (teamKey === 'IRAKLIS') {
      this.teamBanner.style.color  = '#ffcc00';
      this.teamBanner.style.border = '1px solid rgba(255,204,0,.3)';
    }
  }
}

// ── CAMERA CONTROLLER ──────────────────────────────────────
class CameraController {
  constructor(camera) {
    this.camera   = camera;
    this._current = new THREE.Vector3();
    this._target  = new THREE.Vector3();
  }

  update(player, controls) {
    const camDist = 10;
    const camH    = 7;
    const yaw     = controls.cameraYaw;

    this._target.set(
      player.position.x + Math.sin(yaw) * camDist,
      player.position.y + camH,
      player.position.z + Math.cos(yaw) * camDist
    );

    this._current.lerp(this._target, 0.1);
    this.camera.position.copy(this._current);
    this.camera.lookAt(
      player.position.x,
      player.position.y + 1.2,
      player.position.z
    );
  }
}

// ── MAIN GAME ──────────────────────────────────────────────
class Game {
  constructor() {
    this.state       = 'menu';
    this.shakeTimer  = 0;
    this.shakeAmount = 0;
    window.GAME      = this;
  }

  init() {
    // Renderer
    this.renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('c'), antialias: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type    = THREE.BasicShadowMap;

    // Scene
    this.scene  = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x87ceeb, 120, 380);
    this.scene.background = new THREE.Color(0x87ceeb);

    // Camera
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 400);
    this.camera.position.set(0, 14, 20);
    this.camCtrl = new CameraController(this.camera);

    // Lighting
    this._setupLights();

    // Physics
    this.physics = new Physics();

    // City
    this.city = new City(this.scene, this.physics);
    this.city.generate();

    // Controls & HUD
    this.controls = new Controls();
    this.hud      = new HUD();
    this.miniMap  = new MiniMap(document.getElementById('minimap'));

    // Resize
    window.addEventListener('resize', () => {
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
    });

    // Menu team select
    document.getElementById('btn-paok').addEventListener('click', () => this.startGame('PAOK'));
    document.getElementById('btn-iraklis').addEventListener('click', () => this.startGame('IRAKLIS'));
    document.getElementById('btn-paok').addEventListener('touchend', e => { e.preventDefault(); this.startGame('PAOK'); });
    document.getElementById('btn-iraklis').addEventListener('touchend', e => { e.preventDefault(); this.startGame('IRAKLIS'); });
  }

  _setupLights() {
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.75));

    const sun = new THREE.DirectionalLight(0xfff5e0, 1.1);
    sun.position.set(100, 160, 60);
    this.scene.add(sun);

    const fill = new THREE.DirectionalLight(0xadd8f0, 0.25);
    fill.position.set(-80, 60, -40);
    this.scene.add(fill);
  }

  startGame(teamKey) {
    const enemyTeam = teamKey === 'PAOK' ? 'IRAKLIS' : 'PAOK';

    document.getElementById('menu').style.display = 'none';

    // Player
    const spawn = this.city.getPlayerSpawn();
    this.player = new Player(this.scene, teamKey, this.physics);
    this.player.position.copy(spawn);

    // Effects
    this.effects = new Effects(this.scene);

    // Enemies: pick ~20 from spawn points across the map
    const pts = this.city.getSpawnPoints();
    const rng = makePRNG(999);
    this.enemies = [];
    const used = new Set();

    while (this.enemies.length < 20 && this.enemies.length < pts.length) {
      const idx = rng.ri(0, pts.length - 1);
      if (used.has(idx)) continue;
      used.add(idx);
      const pt = pts[idx];
      // Skip spawn points too close to player
      if (pt.distanceTo(spawn) < CELL * 1.5) continue;

      const e = new Enemy(this.scene, enemyTeam, this.physics, this.player);
      // Spread enemies around spawn point
      const ox = (Math.random() - 0.5) * 18;
      const oz = (Math.random() - 0.5) * 18;
      e.position.set(pt.x + ox, 0, pt.z + oz);
      this.enemies.push(e);
    }

    // Assign groups (every 4 enemies share group awareness)
    for (let i = 0; i < this.enemies.length; i += 4) {
      const grp = this.enemies.slice(i, i + 4);
      grp.forEach(e => { e.groupRef = grp; });
    }

    this.hud.setTeam(teamKey);

    this.state    = 'playing';
    this.lastTime = performance.now();
    this._loop(this.lastTime);
  }

  _loop(timestamp) {
    if (this.state === 'dead') return;
    requestAnimationFrame(t => this._loop(t));

    const dt = Math.min((timestamp - this.lastTime) / 1000, 0.05);
    this.lastTime = timestamp;

    if (this.state === 'playing') this._update(dt);
    this._render(dt);
  }

  _update(dt) {
    this.controls.updateKeyboard();

    this.player.update(dt, this.controls, this.enemies, this.effects);
    for (const e of this.enemies) e.update(dt, this.enemies);
    this.effects.update(dt, this.player, this.enemies);

    this.hud.update(dt, this.player, this.enemies);
    this.miniMap.draw(this.player, this.enemies);
    this.camCtrl.update(this.player, this.controls);

    if (this.shakeTimer > 0) {
      this.shakeTimer -= dt;
      const s = this.shakeAmount * (this.shakeTimer / 0.3);
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
    }

    this.controls.flush();
    this._checkEndConditions();
  }

  _render() {
    this.renderer.render(this.scene, this.camera);
  }

  _checkEndConditions() {
    if (this.player.downed && this.state === 'playing') {
      this.state = 'gameover';
      this._showGameOver(false);
      return;
    }
    const allDown = this.enemies.every(e => !e.alive);
    if (allDown && this.enemies.length > 0 && this.state === 'playing') {
      this.state = 'gameover';
      this._showGameOver(true);
    }
  }

  _showGameOver(won) {
    const go   = document.getElementById('gameover');
    const title = document.getElementById('go-title');
    const sub   = document.getElementById('go-sub');
    title.textContent = won ? 'VICTORY!' : 'DOWN!';
    title.style.color = won ? '#44ff88' : '#ff3333';
    sub.textContent   = won
      ? 'Thessaloniki belongs to you tonight.'
      : 'You got battered. Try again.';
    go.classList.add('show');
    this.state = 'dead';
  }

  screenShake(amount) {
    this.shakeTimer  = 0.3;
    this.shakeAmount = amount;
  }

  triggerHitFlash() {
    const el = document.getElementById('hit-flash');
    el.classList.add('flash');
    setTimeout(() => el.classList.remove('flash'), 150);
  }
}

// ── BOOTSTRAP ──────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  // Prevent default iOS scroll/zoom behaviors
  document.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
  document.addEventListener('gesturestart', e => e.preventDefault());

  const game = new Game();
  game.init();
});
