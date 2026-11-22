import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

// --- CONFIGURAÇÃO DE CENA, ILUMINAÇÃO E RENDERER ---
const glbLoader = new GLTFLoader();
const glbCache = new Map();
const playerGlbMixers = [];
const lobbyGlbMixers = [];
let humanGlbTemplate = null;

function loadGLB(url) {
  if (glbCache.has(url)) return glbCache.get(url);
  const promise = new Promise((resolve, reject) => {
    glbLoader.load(url, resolve, undefined, reject);
  });
  glbCache.set(url, promise);
  return promise;
}

function fitModelToHeight(model, targetHeight) {
  const bounds = new THREE.Box3().setFromObject(model);
  const size = bounds.getSize(new THREE.Vector3());
  if (!Number.isFinite(size.y) || size.y <= 0) throw new Error('Modelo 3D sem altura válida');
  const scale = targetHeight / size.y;
  model.scale.setScalar(scale);
  const fitted = new THREE.Box3().setFromObject(model);
  model.position.y -= fitted.min.y;
  model.traverse(obj => {
    if (obj.isMesh) { obj.castShadow = false; obj.receiveShadow = false; }
  });
}

function attachHumanModel(rig, mixerList, isLobby = false) {
  if (!humanGlbTemplate || !rig || rig.userData?.externalHuman) return;
  try {
    const model = SkeletonUtils.clone(humanGlbTemplate.scene);
    fitModelToHeight(model, 1.82);
    // O modelo original é voltado para +Z; o personagem do jogo olha para -Z.
    model.rotation.y = Math.PI;
    rig.children.forEach(child => { child.visible = false; });
    rig.add(model);
    const mixer = new THREE.AnimationMixer(model);
    const idle = THREE.AnimationClip.findByName(humanGlbTemplate.animations, 'Idle')
      || humanGlbTemplate.animations[0];
    if (idle) mixer.clipAction(idle).play();
    mixerList.push(mixer);
    rig.userData = rig.userData || {};
    rig.userData.externalHuman = model;
    rig.userData.externalMixer = mixer;
  } catch (err) {
    console.warn('Não foi possível preparar o personagem GLB:', err);
  }
}

function loadHumanCharacter() {
  loadGLB('https://gobkit.com/freebies/human015/OfficeWorker.glb')
    .then(gltf => {
      humanGlbTemplate = gltf;
      if (typeof heroRig !== 'undefined') attachHumanModel(heroRig.root, playerGlbMixers);
      if (typeof lobbyHero !== 'undefined' && lobbyHero) attachHumanModel(lobbyHero.root, lobbyGlbMixers, true);
      const status = document.getElementById('modelStatus');
      if (status) status.textContent = 'Personagem 3D externo carregado';
    })
    .catch(err => {
      console.warn('Modelo humano externo não carregou; mantendo personagem interno:', err);
      const status = document.getElementById('modelStatus');
      if (status) status.textContent = 'Modelo externo indisponível — personagem 3D interno ativo';
    });
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x74bfe2);
scene.fog = new THREE.FogExp2(0x82c7e6, 0.0044);

const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 480);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.35));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.16;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xebf8ff, 0x3b533a, 2.2));
const sunLight = new THREE.DirectionalLight(0xfff1d6, 2.35);
sunLight.position.set(-45, 75, 45);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(1024, 1024);
sunLight.shadow.camera.left = -145;
sunLight.shadow.camera.right = 145;
sunLight.shadow.camera.top = 145;
sunLight.shadow.camera.bottom = -145;
sunLight.shadow.bias = -0.0002;
scene.add(sunLight);

// Nuvens volumétricas no céu
const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, transparent: true, opacity: 0.88 });
const clouds = [];
for (let i = 0; i < 22; i++) {
  const cg = new THREE.Group();
  for (let p = 0; p < 4; p++) {
    const puff = new THREE.Mesh(new THREE.SphereGeometry(2.8 + Math.random() * 2.5, 12, 10), cloudMat);
    puff.position.set((p - 1.5) * 2.8, (Math.random() - 0.5) * 1.1, (Math.random() - 0.5) * 2.0);
    puff.scale.set(1.35, 0.65, 1);
    cg.add(puff);
  }
  const a = Math.random() * Math.PI * 2, r = 40 + Math.random() * 165;
  cg.position.set(Math.cos(a) * r, 48 + Math.random() * 18, Math.sin(a) * r);
  scene.add(cg);
  clouds.push({ grp: cg, speed: 0.65 + Math.random() * 0.75 });
}

const sunDisc = new THREE.Mesh(new THREE.SphereGeometry(6.5, 24, 18), new THREE.MeshBasicMaterial({ color: 0xfff0b3 }));
sunDisc.position.set(-85, 85, -130);
scene.add(sunDisc);

// Texturas procedurais
function makeTex(base, accent, seed = 1) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const g = c.getContext('2d'); g.fillStyle = base; g.fillRect(0, 0, 128, 128);
  let n = seed >>> 0;
  const rand = () => { n = (n * 1664525 + 1013904223) >>> 0; return n / 4294967296; };
  for (let i = 0; i < 200; i++) {
    g.globalAlpha = 0.08 + rand() * 0.18;
    g.fillStyle = accent;
    g.fillRect(rand() * 128, rand() * 128, 2 + rand() * 18, 2 + rand() * 10);
  }
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(6, 6);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const texHouse = makeTex('#c9b18b', '#fff0c2', 11);
const texWeapon = makeTex('#263d55', '#51c9d0', 37);
const texGroundDetail = makeTex('#4c7c3e', '#b59d65', 71);

// --- MAPA AMPLIADO (RAIO 162) ---
const MAP_RADIUS = 162;
const mat = (c, r = 0.88) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
const grass = new THREE.MeshStandardMaterial({ map: texGroundDetail, roughness: 0.96 });
const sand = mat(0xd1bc7e);
const trunk = mat(0x765035);
const leaves = mat(0x287347);
const rock = mat(0x78858a);

const ground = new THREE.Mesh(new THREE.CylinderGeometry(MAP_RADIUS, MAP_RADIUS, 2, 112), grass);
ground.position.y = -1; ground.receiveShadow = true; scene.add(ground);

const beach = new THREE.Mesh(new THREE.CylinderGeometry(MAP_RADIUS + 3, MAP_RADIUS + 3, 1.2, 112), sand);
beach.position.y = -1.55; scene.add(beach);

// Mar circular com ondas suaves: a malha fica sempre fora da ilha e nunca invade o terreno.
const waterGeo = new THREE.BufferGeometry();
const waterPositions = [], waterIndices = [];
const WATER_RINGS = 28, WATER_SEGMENTS = 112, WATER_RADIUS = 420;
for (let ring = 0; ring <= WATER_RINGS; ring++) {
  const radius = WATER_RADIUS * ring / WATER_RINGS;
  for (let seg = 0; seg <= WATER_SEGMENTS; seg++) {
    const a = seg / WATER_SEGMENTS * Math.PI * 2;
    waterPositions.push(Math.cos(a) * radius, 0, Math.sin(a) * radius);
  }
}
for (let ring = 0; ring < WATER_RINGS; ring++) for (let seg = 0; seg < WATER_SEGMENTS; seg++) {
  const a = ring * (WATER_SEGMENTS + 1) + seg, b = a + WATER_SEGMENTS + 1;
  waterIndices.push(a, b, a + 1, b, b + 1, a + 1);
}
waterGeo.setAttribute('position', new THREE.Float32BufferAttribute(waterPositions, 3));
waterGeo.setIndex(waterIndices);
waterGeo.computeVertexNormals();
const ocean = new THREE.Mesh(waterGeo, new THREE.MeshStandardMaterial({ color: 0x126b83, roughness: 0.24, metalness: 0.12, side: THREE.DoubleSide }));
ocean.position.y = -2.05; ocean.receiveShadow = true; scene.add(ocean);
const waterBaseHeights = waterPositions.filter((_, i) => i % 3 === 1);

const shoreFoam = new THREE.Mesh(new THREE.TorusGeometry(MAP_RADIUS + 3.2, 1.9, 8, 180), new THREE.MeshStandardMaterial({ color: 0xc8f4ed, transparent: true, opacity: 0.55, roughness: 0.35 }));
shoreFoam.rotation.x = Math.PI / 2; shoreFoam.position.y = -0.88; scene.add(shoreFoam);

const seaRings = [];
for (let i = 0; i < 3; i++) {
  const ring = new THREE.Mesh(new THREE.TorusGeometry(MAP_RADIUS + 9 + i * 6, 0.25, 6, 180), new THREE.MeshStandardMaterial({ color: 0x8adbe1, transparent: true, opacity: 0.24 }));
  ring.rotation.x = Math.PI / 2; ring.position.y = -1.72 + i * 0.025; scene.add(ring); seaRings.push(ring);
}

const solidTrees = [], solidBuildings = [], doors = [];
function box(x, y, z, sx, sy, sz, m) {
  const o = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m);
  o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; scene.add(o); return o;
}
const swayingTrees = [];
const treeGroups = [];
// V29: pequenas touceiras e pedras estratificadas para quebrar superfícies vazias sem excesso de polígonos.
const groundDetailGroup=new THREE.Group();scene.add(groundDetailGroup);
const grassBladeMatA=mat(0x6d9b4b,1),grassBladeMatB=mat(0x91a95a,1),stoneLayerMat=mat(0x9b9a8c,1);
for(let i=0;i<260;i++){
 const x=(Math.random()-.5)*285,z=(Math.random()-.5)*285;if(Math.hypot(x,z)>148)continue;
 const tuft=new THREE.Group();groundDetailGroup.add(tuft);tuft.position.set(x,.02,z);
 for(let k=0;k<3;k++){const blade=new THREE.Mesh(new THREE.ConeGeometry(.055,.42+Math.random()*.3,5),k%2?grassBladeMatA:grassBladeMatB);blade.position.set((Math.random()-.5)*.22,.2, (Math.random()-.5)*.22);blade.rotation.z=(Math.random()-.5)*.55;tuft.add(blade);}
}

function tree(x, z, s = 1) {
  const t = new THREE.Group();
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x60412d, roughness: 1 });
  const leafMats = [
    new THREE.MeshStandardMaterial({ color: 0x285c36, roughness: 0.94 }),
    new THREE.MeshStandardMaterial({ color: 0x397544, roughness: 0.96 }),
    new THREE.MeshStandardMaterial({ color: 0x527f42, roughness: 0.96 })
  ];
  const type = Math.random();
  const trunkH = (type > 0.82 ? 3.5 : type > 0.42 ? 2.8 : 3.2) * s;
  const trunkGeo = new THREE.CylinderGeometry(0.17 * s, 0.30 * s, trunkH, 10);
  const trunkMesh = new THREE.Mesh(trunkGeo, trunkMat);
  trunkMesh.position.y = trunkH / 2; trunkMesh.castShadow = true; t.add(trunkMesh);
  const crown = new THREE.Group(); crown.position.y = trunkH * 0.78; t.add(crown);
  if (type < 0.42) {
    // Copa larga e irregular de árvore frondosa.
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * Math.PI * 2;
      const blob = new THREE.Mesh(new THREE.IcosahedronGeometry((0.82 + Math.random() * 0.38) * s, 1), leafMats[i % 3]);
      blob.position.set(Math.cos(a) * 0.72 * s, (Math.random() - 0.5) * 0.55 * s, Math.sin(a) * 0.72 * s);
      blob.scale.set(1.12, 0.82 + Math.random() * 0.25, 1.0); blob.castShadow = true; blob.receiveShadow = true; crown.add(blob);
    }
    const top = new THREE.Mesh(new THREE.IcosahedronGeometry(1.0 * s, 1), leafMats[1]);
    top.position.y = 0.45 * s; top.scale.set(1.12, 0.9, 1.08); top.castShadow = true; crown.add(top);
  } else if (type < 0.82) {
    // Pinheiro com galhos em camadas, sem aparência de bloco.
    for (let i = 0; i < 4; i++) {
      const layer = new THREE.Mesh(new THREE.ConeGeometry((1.45 - i * 0.23) * s, (1.65 - i * 0.12) * s, 11), leafMats[i % 3]);
      layer.position.y = (i * 0.72 + 0.15) * s; layer.rotation.y = i * 0.4; layer.castShadow = true; layer.receiveShadow = true; crown.add(layer);
    }
  } else {
    // Palmeira com folhas curvas e tronco levemente inclinado.
    trunkMesh.rotation.z = -0.08;
    const frondMat = leafMats[1];
    for (let i = 0; i < 9; i++) {
      const a = i / 9 * Math.PI * 2;
      const frond = new THREE.Mesh(new THREE.ConeGeometry(0.22 * s, 2.8 * s, 7), frondMat);
      frond.position.set(Math.cos(a) * 0.85 * s, 0.15 * s, Math.sin(a) * 0.85 * s);
      frond.rotation.z = Math.cos(a) * 0.95; frond.rotation.x = Math.sin(a) * 0.95; frond.rotation.y = a; frond.castShadow = true; crown.add(frond);
    }
  }
  t.position.set(x, 0, z); scene.add(t);
  t.traverse(obj => { if (obj.isMesh && obj.material && obj.material.color) obj.userData.originalTreeColor = obj.material.color.clone(); });
  treeGroups.push(t);
  const radius = type > 0.82 ? 0.78 : type > 0.42 ? 0.72 : 1.0;
  solidTrees.push({ x, z, r: radius * s });
  swayingTrees.push({ crown, phase: Math.random() * Math.PI * 2, strength: 0.012 + Math.random() * 0.016 });
}
let houseVariantIndex = 0;
function building(x, z, sx, sz, color = 0xd7c6a4) {
  const variant = houseVariantIndex++ % 5;
  const wallMat = new THREE.MeshStandardMaterial({ map: texHouse, color, roughness: 0.94 });
  const trimMat = mat(variant % 2 ? 0xe6d6b8 : 0xf0dfbd);
  const roofColors = [0x713f32, 0x46535b, 0x8a5a3d, 0x5c463c, 0x6b5148];
  const roofMat = new THREE.MeshStandardMaterial({ color: roofColors[variant], roughness: 0.9 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x8bd4e8, roughness: 0.16, metalness: 0.08, emissive: 0x173642, emissiveIntensity: 0.12 });
  const woodMat = mat([0x765039, 0x8a6547, 0x59402f, 0x9a7652, 0x6d5140][variant]);
  const floorMat = mat([0x9b8062, 0x88765f, 0xaaa08d, 0x80664e, 0xb4a184][variant]);
  // Base, piso interno e paredes divididas: deixam um vão real para a entrada.
  box(x, 0.12, z, sx + 0.5, 0.24, sz + 0.5, mat(0x77766d));
  box(x, 0.27, z, sx - 0.25, 0.12, sz - 0.25, floorMat);
  const wallH = 3.0, wallY = 1.72, doorW = 1.55, doorH = 2.25;
  // Laterais completas
  box(x - sx/2 + 0.10, wallY, z, 0.20, wallH, sz, wallMat);
  box(x + sx/2 - 0.10, wallY, z, 0.20, wallH, sz, wallMat);
  // Frente e fundo com vão central de porta e faixa superior
  for (const side of [-1, 1]) {
    const wz = z + side * (sz/2 - 0.10);
    const segment = (sx - doorW) / 2;
    box(x - (doorW/2 + segment/2), wallY, wz, segment, wallH, 0.20, wallMat);
    box(x + (doorW/2 + segment/2), wallY, wz, segment, wallH, 0.20, wallMat);
    box(x, doorH + (wallH-doorH)/2 + 0.22, wz, doorW, wallH-doorH, 0.20, wallMat);
  }
  // Telhado inclinado em duas águas, com beiral e cumeeira arredondada.
  const roofA = box(x, 3.48, z - sz * 0.235, sx + 1.0, 0.20, sz * 0.66, roofMat); roofA.rotation.x = -0.43;
  const roofB = box(x, 3.48, z + sz * 0.235, sx + 1.0, 0.20, sz * 0.66, roofMat); roofB.rotation.x = 0.43;
  const ridge = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, sx + 1.0, 10), roofMat); ridge.rotation.z = Math.PI/2; ridge.position.set(x, 4.12, z); scene.add(ridge);
  // Janelas com vidro, moldura e divisórias.
  for (const side of [-1, 1]) for (const wx of [-sx * 0.27, sx * 0.27]) {
    const wz = z + side * (sz/2 + 0.035);
    box(x + wx, 2.0, wz, 1.35, 1.15, 0.10, trimMat);
    box(x + wx, 2.0, wz + side * 0.065, 1.12, 0.92, 0.045, glassMat);
    box(x + wx, 2.0, wz + side * 0.095, 0.055, 0.92, 0.035, trimMat);
    box(x + wx, 2.0, wz + side * 0.095, 1.12, 0.055, 0.035, trimMat);
  }
  // Interior mobiliado: tapete, cama, mesa, sofá, armário e iluminação quente.
  const furniture = new THREE.Group();
  const rugMat = new THREE.MeshStandardMaterial({ color: [0x8c5140,0x536b72,0x9b8050,0x765b75,0x65734d][variant], roughness: 1 });
  const rug = new THREE.Mesh(new THREE.BoxGeometry(sx * 0.48, 0.035, sz * 0.42), rugMat);
  rug.position.set(x + sx * 0.05, 0.36, z + sz * 0.02); furniture.add(rug);
  const bedX = x - sx * 0.25, bedZ = z - sz * 0.22;
  const bed = new THREE.Mesh(new THREE.BoxGeometry(sx * 0.38, 0.34, sz * 0.34), woodMat); bed.position.set(bedX, 0.55, bedZ); furniture.add(bed);
  const mattress = new THREE.Mesh(new THREE.BoxGeometry(sx * 0.35, 0.18, sz * 0.31), mat(variant % 2 ? 0x879ca5 : 0xd7d0bd)); mattress.position.set(bedX, 0.78, bedZ); furniture.add(mattress);
  const pillow = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.12, 0.42), mat(0xe8e2d5)); pillow.position.set(bedX, 0.91, bedZ - sz*0.10); furniture.add(pillow);
  const table = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.62, 0.14, 16), woodMat); table.position.set(x + sx*0.22, 0.92, z + sz*0.18); furniture.add(table);
  for (const dx of [-0.38, 0.38]) for (const dz of [-0.34, 0.34]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.045,0.05,0.75,8), woodMat); leg.position.set(x+sx*0.22+dx,0.52,z+sz*0.18+dz); furniture.add(leg); }
  const sofa = new THREE.Mesh(new THREE.BoxGeometry(1.75,0.58,0.72), mat(variant % 2 ? 0x536d70 : 0x78604c)); sofa.position.set(x+sx*0.20,0.62,z-sz*0.24); furniture.add(sofa);
  const back = new THREE.Mesh(new THREE.BoxGeometry(1.75,0.72,0.18), sofa.material); back.position.set(x+sx*0.20,0.95,z-sz*0.24-0.28); furniture.add(back);
  const cabinet = new THREE.Mesh(new THREE.BoxGeometry(0.9,1.55,0.48), woodMat); cabinet.position.set(x-sx*0.34,1.05,z+sz*0.25); furniture.add(cabinet);
  // Escada compacta até um pequeno mezanino decorativo.
  const stairMat = woodMat;
  for (let i=0;i<6;i++) { const step = new THREE.Mesh(new THREE.BoxGeometry(1.05,0.18,0.42),stairMat); step.position.set(x+sx*0.34,0.38+i*0.34,z-sz*0.30+i*0.43); furniture.add(step); }
  const loft = new THREE.Mesh(new THREE.BoxGeometry(sx*0.34,0.16,sz*0.30), woodMat); loft.position.set(x+sx*0.29,2.35,z-sz*0.20); furniture.add(loft);
  // Corrimãos simples deixam a escada e o mezanino visualmente legíveis.
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.045,0.055,2.55,7), woodMat);
    rail.position.set(x+sx*0.34+side*0.62,1.28,z-sz*0.30+1.05); rail.rotation.x = -0.58; furniture.add(rail);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.055,0.065,1.0,7), woodMat);
    post.position.set(x+sx*0.34+side*0.62,0.78,z-sz*0.30); furniture.add(post);
  }
  // Luminária de teto emissiva (sem luz dinâmica pesada para manter FPS no celular).
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.16,10,8), new THREE.MeshStandardMaterial({ color:0xffe3a1, emissive:0xffb84d, emissiveIntensity:0.75, roughness:0.35 }));
  lamp.position.set(x,2.72,z); furniture.add(lamp);
  furniture.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  scene.add(furniture);
  // Beirais, calha e chaminé com formato arredondado.
  const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.25,0.30,1.15,8), mat(0x8b5142)); chimney.position.set(x+sx*0.30,4.0,z-sz*0.22); chimney.castShadow=true; scene.add(chimney);
  const porch = new THREE.Mesh(new THREE.BoxGeometry(2.5,0.16,1.15), woodMat); porch.position.set(x,0.42,z+sz/2+0.65); porch.castShadow=true; scene.add(porch);
  // Rodapé externo, pilares da varanda e calhas arredondadas dão escala arquitetônica.
  const baseTrim=mat(variant%2?0x756b5b:0x9a8b72);
  for(const side of [-1,1]){
    const skirting=new THREE.Mesh(new THREE.BoxGeometry(sx-.25,.22,.12),baseTrim);skirting.position.set(x,.34,z+side*(sz/2+.015));scene.add(skirting);
    const gutter=new THREE.Mesh(new THREE.CylinderGeometry(.055,.055,sx+.75,8),mat(0x4d5557,.65));gutter.rotation.z=Math.PI/2;gutter.position.set(x,3.45,z+side*(sz/2+.48));scene.add(gutter);
  }
  for(const px of [-.98,.98]){const post=new THREE.Mesh(new THREE.CylinderGeometry(.09,.11,2.35,10),trimMat);post.position.set(x+px,1.58,z+sz/2+.62);post.castShadow=true;scene.add(post);}
  // Molduras de janela com peitoril e venezianas para quebrar o aspecto repetido.
  for(const side of [-1,1]) for(const wx of [-sx*.27,sx*.27]){
    const sill=new THREE.Mesh(new THREE.BoxGeometry(1.48,.12,.22),trimMat);sill.position.set(x+wx,1.39,z+side*(sz/2+.10));scene.add(sill);
    for(const shutterSide of [-1,1]){const shutter=new THREE.Mesh(new THREE.BoxGeometry(.12,.92,.09),woodMat);shutter.position.set(x+wx+shutterSide*.67,2.0,z+side*(sz/2+.11));scene.add(shutter);}
  }
  solidBuildings.push({ x, z, hx: sx / 2 + 0.55, hz: sz / 2 + 0.55, interior: true, sx, sz, variant });
}
function ruin(x, z) {
  const stone = mat(0x777b70), broken = mat(0x96978a);
  box(x, 1.1, z, 10, 2.2, 0.7, stone);
  box(x - 4.7, 1.4, z + 3.8, 0.7, 2.8, 8, stone);
  box(x + 4.7, 0.9, z + 3.8, 0.7, 1.8, 8, broken);
  solidBuildings.push({ x, z, hx: 5.3, hz: 4.5 });
}
function watchTower(x, z) {
  const wood = mat(0x76513a), metal = mat(0x454f57);
  for (const dx of [-1.5, 1.5]) for (const dz of [-1.5, 1.5]) box(x + dx, 3, z + dz, 0.22, 6, 0.22, wood);
  box(x, 5.6, z, 4, 0.35, 4, wood);
  box(x, 6.7, z, 4.6, 0.25, 4.6, metal);
  solidBuildings.push({ x, z, hx: 2.3, hz: 2.3 });
}
function addDoor(x, z) {
  // A folha fica centralizada no vão e gira a partir da dobradiça lateral.
  const hinge = new THREE.Group(); hinge.position.set(x - 0.525, 0, z);
  const doorMat = new THREE.MeshStandardMaterial({ color:0x68452f, roughness:0.82 });
  const slab = new THREE.Mesh(new THREE.BoxGeometry(1.05, 2.02, 0.13), doorMat);
  slab.position.set(0.525, 1.01, 0); slab.castShadow = true; slab.receiveShadow = true; hinge.add(slab);
  // Frisos, maçaneta metálica e pequenas dobradiças visíveis.
  for (const y of [0.34, 1.67]) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.72,0.42,0.035), mat(0x80583c));
    panel.position.set(0.525,y,0.078); hinge.add(panel);
  }
  const handle = new THREE.Mesh(new THREE.SphereGeometry(0.075,10,8), mat(0xd7b56d,0.35));
  handle.position.set(0.88,1.0,0.105); hinge.add(handle);
  const handleStem = new THREE.Mesh(new THREE.CylinderGeometry(0.025,0.025,0.12,8), mat(0xd7b56d,0.35));
  handleStem.rotation.x=Math.PI/2; handleStem.position.set(0.88,1.0,0.065); hinge.add(handleStem);
  for (const y of [0.28,1.72]) {
    const hingePlate = new THREE.Mesh(new THREE.BoxGeometry(0.09,0.18,0.035), mat(0x9a9a91,0.55));
    hingePlate.position.set(0.045,y,-0.085); hinge.add(hingePlate);
  }
  scene.add(hinge);
  // Soleira e degraus externos conectam o terreno ao piso da casa.
  const stepMat = mat(0x8a765e);
  const threshold = new THREE.Mesh(new THREE.BoxGeometry(1.8,0.12,0.42), stepMat);
  threshold.position.set(x,0.18,z+0.18); threshold.receiveShadow=true; scene.add(threshold);
  const porchStep = new THREE.Mesh(new THREE.BoxGeometry(2.0,0.18,0.48), stepMat);
  porchStep.position.set(x,0.09,z+0.68); porchStep.receiveShadow=true; scene.add(porchStep);
  doors.push({ hinge, x, z, open: false, openAmount: 0 });
}

// Árvores e formações rochosas por toda a ilha ampliada
for (let i = 0; i < 28; i++) { const a = i / 28 * Math.PI * 2; tree(Math.cos(a) * 125, Math.sin(a) * 125, 0.85 + Math.random() * 0.55); }
for (let i = 0; i < 65; i++) {
  const x = (Math.random() - 0.5) * 290, z = (Math.random() - 0.5) * 290;
  if (Math.hypot(x, z) > 16 && Math.hypot(x, z) < 152) tree(x, z, 0.7 + Math.random() * 0.65);
}
for (let i = 0; i < 36; i++) {
  const x = (Math.random() - 0.5) * 270, z = (Math.random() - 0.5) * 270;
  if (Math.hypot(x, z) > 10 && Math.hypot(x, z) < 148) {
    const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.6 + Math.random() * 1.1), rock);
    r.position.set(x, 0.45, z); r.castShadow = true; scene.add(r);
  }
}

// --- TERRENO V24: relevo visual, estrada, vegetação e crateras ---
// Relevo suave em camadas: mantém a superfície de colisão original para não quebrar a movimentação.
const hillMatA = new THREE.MeshStandardMaterial({ color: 0x587d43, roughness: 1, map: texGroundDetail });
const hillMatB = new THREE.MeshStandardMaterial({ color: 0x71804a, roughness: 1, map: texGroundDetail });
const hillMatC = new THREE.MeshStandardMaterial({ color: 0x8b8063, roughness: 1 });
const hillSpecs = [
  [-92,-48,17,1.35,13],[-70,82,21,1.55,15],[48,88,19,1.15,13],
  [102,28,23,1.65,16],[82,-88,20,1.25,14],[-108,28,18,1.1,12],
  [22,-102,24,1.4,16],[-28,105,16,0.95,12]
];
for (let i=0;i<hillSpecs.length;i++) {
  const [x,z,r,h,depth]=hillSpecs[i];
  const mound=new THREE.Mesh(new THREE.SphereGeometry(1,28,18),i%3===0?hillMatB:hillMatA);
  mound.scale.set(r,h,depth); mound.position.set(x,-0.30,z); mound.castShadow=true; mound.receiveShadow=true; scene.add(mound);
  // Faixa de solo exposto na encosta para quebrar o visual uniforme.
  if(i%2===0){const patch=new THREE.Mesh(new THREE.SphereGeometry(1,20,12),hillMatC);patch.scale.set(r*.52,.18,depth*.46);patch.position.set(x+r*.18,.12,z-depth*.12);patch.rotation.y=.35;scene.add(patch);}
}
// Estrada de asfalto sinuosa, com acostamento de terra e marcações discretas.
const roadPoints=[new THREE.Vector3(-145,.055,-72),new THREE.Vector3(-112,.055,-45),new THREE.Vector3(-82,.055,-12),new THREE.Vector3(-48,.055,8),new THREE.Vector3(-12,.055,25),new THREE.Vector3(25,.055,38),new THREE.Vector3(62,.055,27),new THREE.Vector3(94,.055,2),new THREE.Vector3(126,.055,-24),new THREE.Vector3(148,.055,-55)];
const roadCurve=new THREE.CatmullRomCurve3(roadPoints);
function makeRoadRibbon(curve,width,material,yOffset=0.07){
 const verts=[],uv=[],idx=[]; const steps=180;
 for(let i=0;i<=steps;i++){const t=i/steps,p=curve.getPoint(t),tan=curve.getTangent(t);const nx=-tan.z,nz=tan.x;const len=Math.hypot(nx,nz)||1;const ox=nx/len*width/2,oz=nz/len*width/2;verts.push(p.x-ox,yOffset,p.z-oz,p.x+ox,yOffset,p.z+oz);uv.push(0,t*18,1,t*18);if(i<steps){const a=i*2;idx.push(a,a+1,a+2,a+1,a+3,a+2);}}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();const mesh=new THREE.Mesh(g,material);mesh.receiveShadow=true;scene.add(mesh);return mesh;
}
const asphaltTex=makeTex('#343b3d','#697174',91);asphaltTex.repeat.set(2,24);
const asphaltMat=new THREE.MeshStandardMaterial({map:asphaltTex,color:0xb7bfc0,roughness:.98});
const shoulderMat=new THREE.MeshStandardMaterial({color:0x9b8c68,roughness:1});
makeRoadRibbon(roadCurve,7.2,shoulderMat,.045);makeRoadRibbon(roadCurve,5.2,asphaltMat,.085);
const lineMat=new THREE.MeshBasicMaterial({color:0xe7dfb7});
for(let i=4;i<48;i+=3){const t=i/52,p=roadCurve.getPoint(t),tan=roadCurve.getTangent(t);const mark=new THREE.Mesh(new THREE.BoxGeometry(.16,.025,1.35),lineMat);mark.position.set(p.x,.112,p.z);mark.rotation.y=Math.atan2(tan.x,tan.z);scene.add(mark);}
// Pequenos sulcos/crateras rasas: apenas visuais, sem buracos que prendam o jogador.
for(let i=0;i<13;i++){
 const a=i*2.399,r=34+(i%4)*23,x=Math.cos(a)*r,z=Math.sin(a)*r;
 const depression=new THREE.Mesh(new THREE.CircleGeometry(1.0+(i%3)*.45,24),new THREE.MeshStandardMaterial({color:0x3f4935,roughness:1}));
 depression.rotation.x=-Math.PI/2;depression.scale.set(1.45,1,.82);depression.position.set(x,.025,z);scene.add(depression);
 const lip=new THREE.Mesh(new THREE.TorusGeometry(1.0+(i%3)*.45,.13,6,24),new THREE.MeshStandardMaterial({color:0x77745d,roughness:1}));lip.rotation.x=Math.PI/2;lip.scale.set(1.45,.82,1);lip.position.set(x,.04,z);scene.add(lip);
}
// Grama alta em tufos instanciados: detalhe barato para o celular.
const bladeGeo=new THREE.ConeGeometry(.055,.72,4);bladeGeo.translate(0,.36,0);
const bladeMat=new THREE.MeshStandardMaterial({color:0x72934b,roughness:1});
const grassInstances=new THREE.InstancedMesh(bladeGeo,bladeMat,420);const dummy=new THREE.Object3D();
for(let i=0;i<420;i++){
 const a=Math.random()*Math.PI*2,r=22+Math.random()*125,x=Math.cos(a)*r,z=Math.sin(a)*r;
 dummy.position.set(x,.02,z);dummy.rotation.set((Math.random()-.5)*.18,Math.random()*Math.PI*2,(Math.random()-.5)*.18);const h=.55+Math.random()*1.15;dummy.scale.set(.65+Math.random()*.5,h,.65+Math.random()*.5);dummy.updateMatrix();grassInstances.setMatrixAt(i,dummy.matrix);
}
grassInstances.instanceMatrix.needsUpdate=true;grassInstances.castShadow=false;grassInstances.receiveShadow=true;scene.add(grassInstances);
// Rochas com gradiente de cor natural, em vez de cinza uniforme.
function makeGradientRock(size){const geo=new THREE.DodecahedronGeometry(size,1);const pos=geo.attributes.position;const colors=[];const low=new THREE.Color(0x514f49),mid=new THREE.Color(0x89877d),high=new THREE.Color(0xb4ad9a);for(let i=0;i<pos.count;i++){const t=THREE.MathUtils.clamp((pos.getY(i)/size+1)*.5,0,1);const c=t<.55?low.clone().lerp(mid,t/.55):mid.clone().lerp(high,(t-.55)/.45);colors.push(c.r,c.g,c.b);}geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));return geo;}
const gradientRockMat=new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:1});
for(let i=0;i<24;i++){const a=Math.random()*Math.PI*2,r=35+Math.random()*112,size=.8+Math.random()*1.7;const stoneMesh=new THREE.Mesh(makeGradientRock(size),gradientRockMat);stoneMesh.position.set(Math.cos(a)*r,size*.48,Math.sin(a)*r);stoneMesh.rotation.set(Math.random()*.4,Math.random()*Math.PI,Math.random()*.4);stoneMesh.scale.set(1+Math.random()*.6,.65+Math.random()*.6,1+Math.random()*.5);stoneMesh.castShadow=true;stoneMesh.receiveShadow=true;scene.add(stoneMesh);}

// Complexos de edifícios, ruínas e torres espalhados
building(-14, -12, 9, 7); addDoor(-14, -15.55);
building(18, 14, 10, 8, 0xd4b98f); addDoor(18, 9.95);
building(6, -32, 8, 7, 0xbfc6c8); addDoor(6, -35.55);
building(-36, 22, 9, 8, 0xd8c6a0); addDoor(-36, 26.05);
building(38, -24, 11, 9, 0xc7b18e); addDoor(38, -28.55);
building(-8, 42, 10, 9, 0xd1c5a9);
building(55, 48, 12, 10, 0xb7b6a2);
building(-65, 58, 11, 9, 0xaaa99c);
building(78, -52, 13, 10, 0x9f9a8a);
building(-82, -56, 12, 9, 0xb6aa91);
building(12, 92, 14, 10, 0xc4b99f);
building(-24, -95, 13, 10, 0xb9b09e);
building(102, 18, 11, 9, 0xd4b98f);
building(-105, -14, 11, 9, 0xc7b18e);

ruin(95, 65); ruin(-98, 52); ruin(86, -96); ruin(-78, -104);
watchTower(48, 86); watchTower(-54, -92); watchTower(116, -8); watchTower(-114, 24);
// V27: novos pontos de referência para explorar (mantendo colisão e escala do mapa).
building(116, 92, 14, 11, 0xc8b89b); addDoor(116, 86.45);
building(-116, 92, 13, 10, 0xb6c0bf); addDoor(-116, 86.95);
ruin(0, 116);
watchTower(0, -122);

// V27: pequenas construções de exploração para quebrar a repetição do cenário.
function addRadioShed(x,z){
  const g=new THREE.Group(), wall=mat(0x8b9694), roof=mat(0x3c4b54), trim=mat(0xc2b28e);
  const add=(geo,m,px,py,pz)=>{const o=new THREE.Mesh(geo,m);o.position.set(px,py,pz);o.castShadow=true;o.receiveShadow=true;g.add(o);return o;};
  add(new THREE.BoxGeometry(8,3.2,6),wall,0,1.65,0);
  add(new THREE.ConeGeometry(5.2,1.8,4),roof,0,4.1,0).rotation.y=Math.PI/4;
  add(new THREE.BoxGeometry(1.1,2.1,.12),trim,0,1.1,3.06);
  const mast=add(new THREE.CylinderGeometry(.08,.12,8,8),roof,3.2,4, -2.2);
  const antenna=add(new THREE.TorusGeometry(.55,.045,6,20),trim,3.2,7.2,-2.2);antenna.rotation.x=Math.PI/2;
  g.position.set(x,0,z);scene.add(g);solidBuildings.push({x,z,hx:4.5,hz:3.5});
}
addRadioShed(0,-72); addRadioShed(72,112);
// --- V26: BIOMAS ALTERNATIVOS (SEM AS TEXTURAS EXPERIMENTAIS DA V25) ---
const desertGroup = new THREE.Group(); scene.add(desertGroup);
const snowGroup = new THREE.Group(); scene.add(snowGroup);
const iceZones = [];
const desertSandTex = makeTex('#c9a76b', '#e7cf91', 213); desertSandTex.repeat.set(10,10);
const snowGroundTex = makeTex('#dce8ed', '#ffffff', 317); snowGroundTex.repeat.set(9,9);
const desertSurfaceMat = new THREE.MeshStandardMaterial({ map: desertSandTex, color: 0xffffff, roughness: 1 });
const snowSurfaceMat = new THREE.MeshStandardMaterial({ map: snowGroundTex, color: 0xffffff, roughness: 0.98 });
const originalGroundMat = ground.material;
const originalBeachMat = beach.material;
const originalGrassInstanceMat = grassInstances.material;
function biomeMesh(geo, material, group, x, y, z, sx=1, sy=1, sz=1, rz=0) {
  const m = new THREE.Mesh(geo, material); m.position.set(x,y,z); m.scale.set(sx,sy,sz); m.rotation.z=rz;
  m.castShadow=true; m.receiveShadow=true; group.add(m); return m;
}
// Cactos de silhueta orgânica e rochas de arenito.
const cactusMat = mat(0x3e7146, 0.95), cactusDark = mat(0x28583b, 1), fossilMat = mat(0xd6c7a5, 0.92);
for (let i=0;i<27;i++) {
  const a=i*2.399, r=24+(i%9)*12, x=Math.cos(a)*r, z=Math.sin(a)*r, h=2.4+(i%4)*0.55;
  const cactus=new THREE.Group();
  const stem=new THREE.Mesh(new THREE.CylinderGeometry(.32,.42,h,9),cactusMat); stem.position.y=h/2; cactus.add(stem);
  for (const side of [-1,1]) { const armY=h*(side<0?.48:.68); const arm=new THREE.Mesh(new THREE.CylinderGeometry(.17,.2,1.15,8),cactusDark); arm.position.set(side*.48,armY,.02); arm.rotation.z=side*.55; cactus.add(arm); const tip=new THREE.Mesh(new THREE.CylinderGeometry(.17,.17,.58,8),cactusMat); tip.position.set(side*.78,armY+.37,.02); cactus.add(tip); }
  cactus.position.set(x,0,z); cactus.rotation.y=(i*.71); desertGroup.add(cactus);
  const boulder=biomeMesh(new THREE.DodecahedronGeometry(1.6+(i%3)*.35,1),mat(0x9a8059),desertGroup,x+3,.6,z-2,1.3,.65,1.0,Math.random()*.5);
}
// Esqueleto de dinossauro: costelas, coluna e crânio estilizados em escala de cenário.
const fossilRig=new THREE.Group(); desertGroup.add(fossilRig); fossilRig.position.set(18,0,-18); fossilRig.rotation.y=-.28;
biomeMesh(new THREE.CapsuleGeometry(.34,10,4,8),fossilMat,fossilRig,0,1.55,0,1,1,1,Math.PI/2);
for(let i=0;i<9;i++){
  const z=-4+i*.95;
  for(const side of [-1,1]){
    const rib=biomeMesh(new THREE.TorusGeometry(1.05,.13,7,18,Math.PI),fossilMat,fossilRig,side*.18,1.45,z,1,1,1,side*Math.PI/2);
    rib.rotation.x=Math.PI/2; rib.rotation.z=side*.12;
  }
  biomeMesh(new THREE.SphereGeometry(.22,10,8),fossilMat,fossilRig,0,1.7,z,1.2,.8,1.1);
}
biomeMesh(new THREE.SphereGeometry(1.05,14,10),fossilMat,fossilRig,0,1.7,5.3,1.35,.8,1.5);
for(const side of [-1,1]) biomeMesh(new THREE.ConeGeometry(.16,.8,8),fossilMat,fossilRig,side*.72,1.18,5.8,1,1,1,Math.PI);
// Outro conjunto de ossos parcialmente enterrado para variar a paisagem.
const fossil2=new THREE.Group(); desertGroup.add(fossil2); fossil2.position.set(-72,.05,48); fossil2.rotation.y=1.2;
for(let i=0;i<6;i++){const bone=biomeMesh(new THREE.CapsuleGeometry(.16,2.4,3,7),fossilMat,fossil2,(i-2.5)*.7,.35,Math.sin(i)*1.1,1,1,1,(i%2?-.45:.45));}
// Neve acumulada e pinheiros adicionais para dar identidade própria ao bioma.
const snowMat = new THREE.MeshStandardMaterial({color:0xeaf5fa,roughness:1});
const pineMatA = mat(0x315b58), pineMatB=mat(0x426d68), iceMat=new THREE.MeshPhysicalMaterial({color:0x8ed9ed,roughness:.16,metalness:.08,transparent:true,opacity:.82,clearcoat:.8});
for(let i=0;i<36;i++){
  const a=i*2.399,r=26+(i%10)*11,x=Math.cos(a)*r,z=Math.sin(a)*r,h=5+(i%4)*.65;
  const pine=new THREE.Group();
  const trunkM=new THREE.Mesh(new THREE.CylinderGeometry(.18,.34,1.7,8),mat(0x594332)); trunkM.position.y=.85; pine.add(trunkM);
  for(let j=0;j<4;j++){const cone=new THREE.Mesh(new THREE.ConeGeometry(1.65-j*.27,2.3,9),j%2?pineMatA:pineMatB);cone.position.y=1.4+j*1.05;pine.add(cone);const cap=new THREE.Mesh(new THREE.ConeGeometry(1.52-j*.27,.32,9),snowMat);cap.position.y=2.42+j*1.05;pine.add(cap);}
  pine.position.set(x,0,z); snowGroup.add(pine);
}
// Poças de gelo com limites elípticos usados pela física de deslizamento.
const iceSpecs=[[-42,-28,8,5],[52,-62,10,6],[72,66,7,5],[-88,22,9,6],[8,104,8,5]];
for(const [x,z,rx,rz] of iceSpecs){
  const puddle=biomeMesh(new THREE.CircleGeometry(1,40),iceMat,snowGroup,x,.055,z,rx,rz,1,0); puddle.rotation.x=-Math.PI/2;
  const rim=biomeMesh(new THREE.TorusGeometry(1,.055,6,40),snowMat,snowGroup,x,.065,z,rx,rz,1,0); rim.rotation.x=Math.PI/2;
  iceZones.push({x,z,rx,rz});
  for(let k=0;k<5;k++){const crystal=biomeMesh(new THREE.IcosahedronGeometry(.18+Math.random()*.18,0),snowMat,snowGroup,x+(Math.random()-.5)*rx*1.5,.16,z+(Math.random()-.5)*rz*1.5,1,1.5,1,0);}
}
for(let i=0;i<24;i++){const a=i*2.4,r=32+(i%7)*15,x=Math.cos(a)*r,z=Math.sin(a)*r;biomeMesh(new THREE.SphereGeometry(1,10,8),snowMat,snowGroup,x,.25,z,1.6,.35,1.2,Math.random());}

// V28: dois biomas extras construídos em geometria 3D nativa.
const volcanoGroup=new THREE.Group(); scene.add(volcanoGroup);
const cityGroup=new THREE.Group(); scene.add(cityGroup);
const lavaMat=new THREE.MeshStandardMaterial({color:0xff5a18,emissive:0xb52b08,emissiveIntensity:1.1,roughness:.42});
const basaltMat=mat(0x34383c,1), ashMat=mat(0x625b56,1), cityWall=mat(0x777f84,.95), cityGlass=new THREE.MeshStandardMaterial({color:0x7cc9d9,metalness:.55,roughness:.2,transparent:true,opacity:.55});
// Vulcões, campos de basalto e veios luminosos de lava (decorativos).
for(let i=0;i<8;i++){
 const a=i*2.399,r=35+(i%3)*22,x=Math.cos(a)*r,z=Math.sin(a)*r,h=5+(i%4)*2.2;
 const cone=biomeMesh(new THREE.ConeGeometry(8+(i%3)*2,h,9),basaltMat,volcanoGroup,x,h/2,z,1,1,1,0);
 const crater=biomeMesh(new THREE.TorusGeometry(2.1,.42,8,18),lavaMat,volcanoGroup,x,h*.83,z,1,1,1,0);crater.rotation.x=Math.PI/2;
 for(let k=0;k<3;k++){const flow=biomeMesh(new THREE.TorusGeometry(1.3+k*.42,.12,5,20),lavaMat,volcanoGroup,x+(k-1)*1.2,.16,z+(k%2?1:-1)*2,1.3,.45,1,Math.random()*2);flow.rotation.x=Math.PI/2;}
}
for(let i=0;i<38;i++){const a=i*2.4,r=18+(i%9)*13,x=Math.cos(a)*r,z=Math.sin(a)*r;biomeMesh(new THREE.DodecahedronGeometry(.8+(i%4)*.35,0),ashMat,volcanoGroup,x,.35,z,1.4,.7,1.1,Math.random());}
// Cidade abandonada: prédios de alturas variadas, janelas e blocos de entulho.
function addCityBlock(x,z,w,d,h,seed){
 const g=new THREE.Group();cityGroup.add(g);
 const body=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),cityWall);body.position.y=h/2;body.castShadow=true;body.receiveShadow=true;g.add(body);
 const roof=new THREE.Mesh(new THREE.BoxGeometry(w+.35,.28,d+.35),basaltMat);roof.position.y=h+.12;g.add(roof);
 const cols=Math.max(2,Math.floor(w/2.2)),rows=Math.max(2,Math.floor(h/2.1));
 for(let yy=0;yy<rows;yy++)for(let xx=0;xx<cols;xx++){
  const win=new THREE.Mesh(new THREE.BoxGeometry(.72,.92,.055),cityGlass);win.position.set(-w/2+(xx+.5)*w/cols,1.25+yy*2.05,d/2+.035);g.add(win);
 }
 const door=new THREE.Mesh(new THREE.BoxGeometry(1.1,2,.09),mat(0x493b31));door.position.set(0,1,d/2+.08);g.add(door);
 g.position.set(x,0,z);g.rotation.y=(seed%3-1)*.035;
 solidBuildings.push({x,z,hx:w/2+.5,hz:d/2+.5});
 for(let k=0;k<3;k++){const rubble=new THREE.Mesh(new THREE.DodecahedronGeometry(.45+k*.12,0),ashMat);rubble.position.set(x+(Math.random()-.5)*w*1.8,.25,z+(Math.random()-.5)*d*1.8);cityGroup.add(rubble);}
}
[[ -72,-48,12,10,16],[ -38,65,10,12,22],[ 54,48,14,11,18],[ 82,-62,11,10,13],[ 8,88,13,12,25],[ -96,8,10,9,14],[ 102,18,12,12,20],[ 22,-92,14,10,17]].forEach((v,i)=>addCityBlock(...v,i));
// V29: bairro industrial abandonado com fachadas quebradas, postes, placas e entulho detalhado.
const cityDetailGroup=new THREE.Group();cityGroup.add(cityDetailGroup);
const rustMat=mat(0x754b37,.92), concreteMat=mat(0x858987,1), darkGlass=new THREE.MeshStandardMaterial({color:0x263f49,metalness:.25,roughness:.42}), warningMat=new THREE.MeshStandardMaterial({color:0xd7a83d,roughness:.85});
function addRuinFacade(x,z,w,h,rot=0){
 const g=new THREE.Group();cityDetailGroup.add(g);g.position.set(x,0,z);g.rotation.y=rot;
 const wall=new THREE.Mesh(new THREE.BoxGeometry(w,h,.34),concreteMat);wall.position.y=h/2;wall.castShadow=true;wall.receiveShadow=true;g.add(wall);
 for(let i=0;i<Math.floor(w/2.3);i++){
  const wx=-w/2+1.1+i*2.3;const frame=new THREE.Mesh(new THREE.BoxGeometry(1.05,1.35,.12),rustMat);frame.position.set(wx,Math.min(h-1.0,2.25),.23);g.add(frame);
  const pane=new THREE.Mesh(new THREE.BoxGeometry(.82,1.08,.08),darkGlass);pane.position.set(wx,Math.min(h-1.0,2.25),.31);g.add(pane);
 }
 // Quebras no topo e barras expostas dão silhueta de prédio desativado.
 for(let i=0;i<4;i++){const beam=new THREE.Mesh(new THREE.BoxGeometry(.12,.9,.12),rustMat);beam.position.set(-w/2+i*w/3,h+.25,.12);beam.rotation.z=(i%2?-.22:.18);g.add(beam);}
 const sign=new THREE.Mesh(new THREE.BoxGeometry(Math.min(3,w*.55),.62,.16),warningMat);sign.position.set(0,h-.65,.28);g.add(sign);
 for(const o of g.children){o.castShadow=true;o.receiveShadow=true;}
 solidBuildings.push({x,z,hx:w/2+.45,hz:.9});
}
addRuinFacade(-55,-5,13,5.8,.15);addRuinFacade(46,-18,15,7.2,-.12);addRuinFacade(75,72,12,4.8,.35);
function cityLamp(x,z){const pole=new THREE.Group();cityDetailGroup.add(pole);pole.position.set(x,0,z);const stem=new THREE.Mesh(new THREE.CylinderGeometry(.09,.13,5.8,8),rustMat);stem.position.y=2.9;pole.add(stem);const arm=new THREE.Mesh(new THREE.BoxGeometry(1.35,.12,.14),rustMat);arm.position.set(.55,5.55,0);pole.add(arm);const lamp=new THREE.Mesh(new THREE.BoxGeometry(.48,.18,.42),new THREE.MeshStandardMaterial({color:0xf4d58a,emissive:0xc18c39,emissiveIntensity:.35}));lamp.position.set(1.05,5.45,0);pole.add(lamp);}
[[-82,-24],[-24,34],[62,8],[94,-38],[30,102]].forEach(v=>cityLamp(...v));
for(let i=0;i<46;i++){const a=i*2.4,r=25+(i%8)*10,x=Math.cos(a)*r,z=Math.sin(a)*r;const debris=new THREE.Mesh(new THREE.DodecahedronGeometry(.25+(i%4)*.12,0),i%3?concreteMat:rustMat);debris.position.set(x,.18,z);debris.rotation.set(i*.3,i*.7,i*.2);debris.scale.set(1.4,.65,.9);cityDetailGroup.add(debris);}


let mapTheme='island';
function applyMapTheme(theme){
  mapTheme=theme;
  desertGroup.visible=theme==='desert'; snowGroup.visible=theme==='snow'; volcanoGroup.visible=theme==='volcano'; cityGroup.visible=theme==='city';
  ground.material=theme==='desert'?desertSurfaceMat:theme==='snow'?snowSurfaceMat:theme==='volcano'?mat(0x514943):theme==='city'?mat(0x555b60):originalGroundMat;
  beach.material=theme==='desert'?mat(0xb99258):theme==='snow'?mat(0xc9dce5):theme==='volcano'?mat(0x3e3430):theme==='city'?mat(0x686d70):originalBeachMat;
  grassInstances.visible=theme==='island';
  groundDetailGroup.visible=theme==='island';
  for(const t of treeGroups){
    t.visible=theme==='island'||theme==='snow';
    t.traverse(obj=>{if(obj.isMesh&&obj.material&&obj.userData.originalTreeColor){
      if(!obj.userData.themeMaterial) obj.userData.themeMaterial=obj.material.clone();
      obj.material.color.copy(obj.userData.originalTreeColor);
      if(theme==='snow' && obj.userData.originalTreeColor.g>obj.userData.originalTreeColor.r*1.08) obj.material.color.set(0xdce9e9);
    }});
  }
  scene.background.set(theme==='desert'?0xe9c58b:theme==='snow'?0x9abed0:theme==='volcano'?0x4b3432:theme==='city'?0x87949b:0x74bfe2);
  scene.fog.color.set(theme==='desert'?0xe7c58f:theme==='snow'?0xc5dce8:theme==='volcano'?0x65504b:theme==='city'?0x9aa5a8:0x82c7e6);
  scene.fog.density=theme==='desert'?.0032:theme==='snow'?.0048:theme==='volcano'?.0052:theme==='city'?.0042:.0044;
  sunLight.color.set(theme==='desert'?0xffe0ad:theme==='snow'?0xdcecff:theme==='volcano'?0xff9b65:theme==='city'?0xdce5e8:0xfff1d6);
  sunLight.intensity=theme==='desert'?2.55:theme==='snow'?1.85:theme==='volcano'?2.05:theme==='city'?1.95:2.35;
  const desc=document.getElementById('mapDescription');
  if(desc) desc.textContent=theme==='desert'?'Dunas, cactos, rochas e fósseis gigantes.':theme==='snow'?'Pinheiros nevados e poças de gelo escorregadias.':theme==='volcano'?'Campos de basalto, crateras e rios decorativos de lava.':theme==='city'?'Cidade abandonada com prédios, janelas e ruas de concreto.':'Ilha verde original com casas, estrada e floresta.';
}
// Prévia 3D real do personagem no lobby, com plataforma e iluminação próprias.
let lobbyScene=null,lobbyCamera=null,lobbyRenderer=null,lobbyHero=null,lobbyTurn=0,lobbyDrag=false,lobbyLastX=0,lobbyClock=0;
function initLobbyPreview(){
  const canvas=document.getElementById('lobbyPreviewCanvas'); if(!canvas)return;
  lobbyScene=new THREE.Scene(); lobbyScene.background=new THREE.Color(0x0b2638); lobbyScene.fog=new THREE.Fog(0x0b2638,9,22);
  lobbyCamera=new THREE.PerspectiveCamera(34,1,0.1,60); lobbyCamera.position.set(0,2.2,7.8); lobbyCamera.lookAt(0,1.15,0);
  lobbyRenderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'low-power'});
  lobbyRenderer.setPixelRatio(Math.min(devicePixelRatio,1.2)); lobbyRenderer.outputColorSpace=THREE.SRGBColorSpace; lobbyRenderer.shadowMap.enabled=true;
  lobbyScene.add(new THREE.HemisphereLight(0xc9f4ff,0x173044,2.1));
  const key=new THREE.DirectionalLight(0xffe3b0,2.4); key.position.set(-3,7,5); key.castShadow=true; key.shadow.mapSize.set(512,512); lobbyScene.add(key);
  const rim=new THREE.PointLight(0x36d9d2,2.2,12); rim.position.set(3,2,1); lobbyScene.add(rim);
  const fill=new THREE.PointLight(0xffc477,1.25,10); fill.position.set(-3,1.4,2); lobbyScene.add(fill);
  const floor=new THREE.Mesh(new THREE.CylinderGeometry(2.25,2.4,.22,48),new THREE.MeshStandardMaterial({color:0x153e4c,metalness:.45,roughness:.38})); floor.position.y=-.13; floor.receiveShadow=true; lobbyScene.add(floor);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(1.85,.025,8,64),new THREE.MeshBasicMaterial({color:0x54e7dc})); ring.rotation.x=Math.PI/2; ring.position.y=.005; lobbyScene.add(ring);
  const back=new THREE.Mesh(new THREE.CircleGeometry(3.7,48),new THREE.MeshBasicMaterial({color:0x12394a})); back.position.set(0,1.5,-2.7); lobbyScene.add(back);
  lobbyHero=buildArticulatedCharacter(skinConfigs[Number(document.getElementById('skinChoice').value)||0],false); lobbyHero.root.position.y=0; lobbyScene.add(lobbyHero.root); attachHumanModel(lobbyHero.root,lobbyGlbMixers,true);
  const resize=()=>{const w=Math.max(1,canvas.clientWidth),h=Math.max(1,canvas.clientHeight);lobbyRenderer.setSize(w,h,false);lobbyCamera.aspect=w/h;lobbyCamera.updateProjectionMatrix();};
  new ResizeObserver(resize).observe(canvas); resize();
  const box=document.getElementById('skinPreview');
  box.addEventListener('pointerdown',e=>{lobbyDrag=true;lobbyLastX=e.clientX;box.setPointerCapture?.(e.pointerId)});
  box.addEventListener('pointermove',e=>{if(!lobbyDrag)return;lobbyTurn+=(e.clientX-lobbyLastX)*.012;lobbyLastX=e.clientX});
  ['pointerup','pointercancel','lostpointercapture'].forEach(ev=>box.addEventListener(ev,()=>lobbyDrag=false));
}
function updateLobbyPreview(dt){
  if(!lobbyRenderer||!lobbyHero)return;
  for(const mixer of lobbyGlbMixers) mixer.update(dt);
  lobbyClock+=dt;
  const breathe=Math.sin(lobbyClock*2.0);
  lobbyHero.root.rotation.y=lobbyTurn+Math.sin(lobbyClock*.38)*.055;
  lobbyHero.root.position.y=Math.sin(lobbyClock*1.7)*.025;
  lobbyHero.torso.rotation.x=breathe*.018;
  lobbyHero.headGrp.rotation.y=Math.sin(lobbyClock*.72)*.10;
  lobbyHero.headGrp.rotation.x=Math.sin(lobbyClock*.9)*.025;
  lobbyHero.leftArm.rotation.x=Math.sin(lobbyClock*1.25)*.075-.04;
  lobbyHero.rightArm.rotation.x=-Math.sin(lobbyClock*1.25)*.075-.04;
  lobbyHero.leftArm.rotation.z=.035+Math.sin(lobbyClock*.8)*.018;
  lobbyHero.rightArm.rotation.z=-.035-Math.sin(lobbyClock*.8)*.018;
  lobbyRenderer.render(lobbyScene,lobbyCamera);
}

document.getElementById('mapChoice').addEventListener('change',e=>applyMapTheme(e.target.value));
applyMapTheme('island');
// refreshCareer() só pode ser chamado depois da inicialização de `career` abaixo.

// --- 4 SKINS EXCLUSIVAS ARTICULADAS (2 FEMININAS + 2 MASCULINAS) ---
const skinConfigs = [
  { name: "Valkyrie", label: "Valkyrie (Feminina)", desc: "Recon Esmeralda · Armadura Leve", gender: "female", primary: 0x10b981, secondary: 0x064e3b, visor: 0x34d399, skin: 0xf1c27d, hair: 0x1e1b18, grad: "linear-gradient(90deg,#064e3b,#10b981,#064e3b)" },
  { name: "Nova", label: "Nova (Feminina)", desc: "Ciano Cyber · Infiltração Ágil", gender: "female", primary: 0x06b6d4, secondary: 0x164e63, visor: 0x67e8f9, skin: 0xe0ac69, hair: 0xe2e8f0, grad: "linear-gradient(90deg,#164e63,#06b6d4,#164e63)" },
  { name: "Apex", label: "Apex (Masculino)", desc: "Azul Vanguarda · Assalto Tático", gender: "male", primary: 0x3b82f6, secondary: 0x1e3a8a, visor: 0x93c5fd, skin: 0xc68642, hair: 0x0f172a, grad: "linear-gradient(90deg,#1e3a8a,#3b82f6,#1e3a8a)" },
  { name: "Titan", label: "Titan (Masculino)", desc: "Dourado Pesado · Blindagem Máxima", gender: "male", primary: 0xf59e0b, secondary: 0x451a03, visor: 0xfde047, skin: 0x8d5524, hair: 0x1c1917, grad: "linear-gradient(90deg,#451a03,#f59e0b,#451a03)" },
  { name: "Phantom", label: "Phantom (Masculino)", desc: "Grafite · Explorador Urbano", gender: "male", primary: 0x475569, secondary: 0x111827, visor: 0x94a3b8, skin: 0xc68642, hair: 0x111827, grad: "linear-gradient(90deg,#111827,#64748b,#111827)" },
  { name: "Aurora", label: "Aurora (Feminina)", desc: "Violeta · Patrulha Ártica", gender: "female", primary: 0x8b5cf6, secondary: 0x312e81, visor: 0xc4b5fd, skin: 0xf1c27d, hair: 0x3b245f, grad: "linear-gradient(90deg,#312e81,#a78bfa,#312e81)" }
];

function buildArticulatedCharacter(cfg, isBot = false) {
  const root = new THREE.Group();
  const isFemale = cfg.gender === "female";
  const sx = isFemale ? 0.86 : 1.06;
  const waist = isFemale ? 0.78 : 0.98;

  const armorMat = new THREE.MeshStandardMaterial({ color: cfg.primary, roughness: 0.34, metalness: 0.45 });
  const suitMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.7, metalness: 0.2 });
  const secMat = new THREE.MeshStandardMaterial({ color: cfg.secondary, roughness: 0.4, metalness: 0.5 });
  const visorMat = new THREE.MeshStandardMaterial({ color: cfg.visor, emissive: cfg.visor, emissiveIntensity: 0.65, roughness: 0.1 });
  const skinMat = new THREE.MeshStandardMaterial({ color: cfg.skin, roughness: 0.55 });
  const hairMat = new THREE.MeshStandardMaterial({ color: cfg.hair, roughness: 0.8 });

  const pelvis = new THREE.Group();
  pelvis.position.y = 0.96;
  const pelvMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.24 * sx, 0.22 * sx, 0.24, 14), suitMat);
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.26 * sx, 0.26 * sx, 0.08, 14), secMat);
  belt.position.y = 0.05;
  pelvis.add(pelvMesh, belt);
  root.add(pelvis);

  const torso = new THREE.Group();
  torso.position.y = 1.40;
  const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.30 * sx, 0.22 * waist, 0.60, 16), armorMat);
  chest.scale.set(1, 1, 0.72);
  const chestPlate = new THREE.Mesh(new THREE.CylinderGeometry(0.22 * sx, 0.18 * waist, 0.36, 12), secMat);
  chestPlate.position.set(0, 0.06, -0.14);
  chestPlate.scale.set(1, 1, 0.45);
  const backpack = new THREE.Mesh(new THREE.CapsuleGeometry(0.16 * sx, 0.26, 6, 12), secMat);
  backpack.position.set(0, 0.04, 0.20);
  backpack.scale.set(1.1, 1, 0.65);
  torso.add(chest, chestPlate, backpack);
  const seamMat=new THREE.MeshStandardMaterial({color:0xcbd5e1,metalness:.35,roughness:.45});
  for(const side of [-1,1]){
    const strap=new THREE.Mesh(new THREE.BoxGeometry(.055,.48,.035),secMat);
    strap.position.set(side*.205,.02,-.205); strap.rotation.z=side*.12; torso.add(strap);
    const shoulderPad=new THREE.Mesh(new THREE.SphereGeometry(.145,12,10),secMat);
    shoulderPad.position.set(side*.31,.22,0); shoulderPad.scale.set(1,.72,1.05); torso.add(shoulderPad);
    const chestLight=new THREE.Mesh(new THREE.BoxGeometry(.045,.045,.018),seamMat);
    chestLight.position.set(side*.105,.08,-.232); torso.add(chestLight);
  }
  const chestCore=new THREE.Mesh(new THREE.BoxGeometry(.09,.12,.025),visorMat);
  chestCore.position.set(0,-.02,-.235); torso.add(chestCore);
  root.add(torso);

  const headGrp = new THREE.Group();
  headGrp.position.y = 1.94;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.105, 0.16, 12), skinMat);
  neck.position.y = -0.14;
  const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.185, 18, 16), skinMat);
  headMesh.scale.set(0.92, 1.08, 0.98);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.20, 18, 16, 0, Math.PI * 2, 0, Math.PI * 0.56), armorMat);
  helmet.rotation.x = 0.12;
  const visor = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.065, 14, 1, false, Math.PI * 0.65, Math.PI * 0.7), visorMat);
  visor.position.set(0, 0.01, -0.04);
  // Rosto visível com olhos, sobrancelhas, nariz, boca, orelhas e cabelo 3D.
  const faceDark = new THREE.MeshStandardMaterial({color:0x241914,roughness:0.7});
  const eyeWhite = new THREE.MeshStandardMaterial({color:0xf8fafc,roughness:0.35});
  const irisMat = new THREE.MeshStandardMaterial({color:0x263f52,roughness:0.25});
  const mouthMat = new THREE.MeshStandardMaterial({color:0x7f3340,roughness:0.65});
  // O capacete passa a ser uma peça superior, deixando a face descoberta.
  helmet.scale.set(0.96,0.68,0.94); helmet.position.y=0.105;
  visor.scale.set(0.78,0.72,1); visor.position.set(0,0.065,-0.145);
  for (const side of [-1,1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.026,12,10),eyeWhite); eye.position.set(side*0.066,0.018,-0.164); eye.scale.set(1,0.78,0.48); headGrp.add(eye);
    const iris = new THREE.Mesh(new THREE.SphereGeometry(0.012,10,8),irisMat); iris.position.set(side*0.066,0.017,-0.178); headGrp.add(iris);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.058,0.012,0.018),hairMat); brow.position.set(side*0.066,0.058,-0.157); brow.rotation.z=side*-0.10; headGrp.add(brow);
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.038,10,8),skinMat); ear.position.set(side*0.176,-0.005,-0.005); ear.scale.set(0.45,0.8,0.65); headGrp.add(ear);
  }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.025,10,8),skinMat); nose.position.set(0,-0.025,-0.181); nose.scale.set(0.72,1,0.72); headGrp.add(nose);
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.065,0.012,0.012),mouthMat); mouth.position.set(0,-0.083,-0.16); headGrp.add(mouth);
  // Brilho dos olhos, narinas discretas e detalhes de expressão para leitura do rosto.
  for (const side of [-1,1]) {
    const glint = new THREE.Mesh(new THREE.SphereGeometry(0.006,8,8),new THREE.MeshBasicMaterial({color:0xffffff}));
    glint.position.set(side*0.071,0.025,-0.184); headGrp.add(glint);
    const nostril = new THREE.Mesh(new THREE.SphereGeometry(0.006,7,6),faceDark);
    nostril.position.set(side*0.012,-0.034,-0.201); headGrp.add(nostril);
  }
  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.19,16,12,0,Math.PI*2,0,Math.PI*0.48),hairMat); hairCap.position.y=0.075; hairCap.scale.set(1.02,0.72,1.02); headGrp.add(hairCap);
  const sideHairL = new THREE.Mesh(new THREE.CapsuleGeometry(0.035,0.12,4,8),hairMat); sideHairL.position.set(-0.145,-0.015,0.01); sideHairL.rotation.z=0.16; headGrp.add(sideHairL);
  const sideHairR = sideHairL.clone(); sideHairR.position.x=0.145; sideHairR.rotation.z=-0.16; headGrp.add(sideHairR);
  // Franja e mechas modeladas em volume, sem textura externa.
  for(let i=0;i<5;i++){
    const lock=new THREE.Mesh(new THREE.CapsuleGeometry(0.018,0.075+(i%2)*0.025,4,7),hairMat);
    lock.position.set((i-2)*0.052,0.105,-0.115-Math.abs(i-2)*0.006);
    lock.rotation.z=(i-2)*-0.16; lock.rotation.x=-0.25; headGrp.add(lock);
  }
  const earInnerMat=new THREE.MeshStandardMaterial({color:0x9c6252,roughness:0.8});
  for(const side of [-1,1]){
    const inner=new THREE.Mesh(new THREE.SphereGeometry(0.018,8,7),earInnerMat);
    inner.position.set(side*0.184,-0.005,-0.015); inner.scale.set(.45,.9,.5); headGrp.add(inner);
  }
  headGrp.add(neck, headMesh, helmet, visor);

  if (isFemale) {
    const ponytail = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.34, 12), hairMat);
    ponytail.position.set(0, -0.05, 0.22);
    ponytail.rotation.x = 0.45;
    headGrp.add(ponytail);
  }
  root.add(headGrp);

  function makeArm(side) {
    const arm = new THREE.Group();
    arm.position.set(side * (0.34 * sx), 1.64, 0);
    const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 12), secMat);
    shoulder.scale.set(1.1, 0.9, 1.1);
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.07, 0.30, 12), armorMat);
    upper.position.y = -0.18;
    const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.055, 0.30, 12), suitMat);
    fore.position.y = -0.45;
    const gloveMat=new THREE.MeshStandardMaterial({color:0x17212b,roughness:.82});
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.067, 12, 10), gloveMat);
    hand.position.y = -0.62;
    const cuff=new THREE.Mesh(new THREE.CylinderGeometry(.067,.072,.075,10),secMat);
    cuff.position.y=-.535; arm.add(cuff);
    // Dedos pequenos dão volume de mão sem pesar muito no celular.
    for(let f=0;f<4;f++){
      const finger=new THREE.Mesh(new THREE.CapsuleGeometry(.012,.045,3,6),gloveMat);
      finger.position.set((f-1.5)*.027,-.675,-.025); finger.rotation.z=(f-1.5)*-.10; arm.add(finger);
    }
    const thumb=new THREE.Mesh(new THREE.CapsuleGeometry(.014,.045,3,6),gloveMat);
    thumb.position.set(side*.075,-.635,-.005); thumb.rotation.z=side*-.75; arm.add(thumb);
    arm.add(shoulder, upper, fore, hand);
    return arm;
  }
  const leftArm = makeArm(-1);
  const rightArm = makeArm(1);
  root.add(leftArm, rightArm);

  function makeLeg(side) {
    const leg = new THREE.Group();
    leg.position.set(side * (0.14 * sx), 0.90, 0);
    const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.09, 0.42, 12), suitMat);
    thigh.position.y = -0.21;
    const knee = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 10), armorMat);
    knee.position.set(0, -0.42, -0.05);
    knee.scale.set(1, 0.85, 0.7);
    const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.07, 0.40, 12), secMat);
    shin.position.y = -0.62;
    const shinGuard=new THREE.Mesh(new THREE.BoxGeometry(.12,.22,.055),armorMat);
    shinGuard.position.set(0,-.62,-.073); leg.add(shinGuard);
    const boot = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.12, 6, 10), suitMat);
    boot.rotation.x = Math.PI / 2;
    boot.position.set(0, -0.84, -0.04);
    const sole=new THREE.Mesh(new THREE.BoxGeometry(.17,.045,.25),secMat);
    sole.position.set(0,-.91,-.055);
    leg.add(thigh, knee, shin, boot, sole);
    return leg;
  }
  const leftLeg = makeLeg(-1);
  const rightLeg = makeLeg(1);
  root.add(leftLeg, rightLeg);

  const tagPart = (grp, partName) => {
    grp.traverse(obj => {
      if (obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
        obj.userData.hitPart = partName;
        obj.userData.isBotMesh = isBot;
      }
    });
  };
  tagPart(headGrp, 'head');
  tagPart(torso, 'torso');
  tagPart(pelvis, 'torso');
  tagPart(leftArm, 'limb');
  tagPart(rightArm, 'limb');
  tagPart(leftLeg, 'limb');
  tagPart(rightLeg, 'limb');

  return { root, headGrp, torso, leftArm, rightArm, leftLeg, rightLeg };
}

const player = new THREE.Group();
scene.add(player);
let heroRig = buildArticulatedCharacter(skinConfigs[0], false);
player.add(heroRig.root);
loadHumanCharacter();

// --- MODELOS DISTINTOS PARA CADA ARMA (3ª PESSOA E VIEWMODEL REALISTA EM 1ª PESSOA) ---
const weaponTypes = [
  { id: 'pistol', name: 'Pistola Tática', mag: 15, damage: 28, rate: 0.26, color: 0x94a3b8, zoomFov: 44, recoilKick: 0.07, recoilPitch: 0.015 },
  { id: 'smg', name: 'SMG Vector', mag: 32, damage: 19, rate: 0.095, color: 0x2dd4bf, zoomFov: 38, recoilKick: 0.05, recoilPitch: 0.010 },
  { id: 'rifle', name: 'Rifle M4A1', mag: 30, damage: 34, rate: 0.15, color: 0x3b82f6, zoomFov: 28, recoilKick: 0.09, recoilPitch: 0.018 },
  { id: 'shotgun', name: 'Doze Combat', mag: 6, damage: 64, rate: 0.62, color: 0xf59e0b, zoomFov: 48, recoilKick: 0.18, recoilPitch: 0.038 },
  { id: 'sniper', name: 'Sniper L96', mag: 8, damage: 85, rate: 0.72, color: 0x10b981, zoomFov: 14, recoilKick: 0.22, recoilPitch: 0.045 }
];

function createWeaponMesh(type, isFirstPersonView = false) {
  const grp = new THREE.Group();
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x111827, metalness: 0.8, roughness: 0.25 });
  const accentMetal = new THREE.MeshStandardMaterial({ color: type.color, metalness: 0.55, roughness: 0.28, emissive: type.color, emissiveIntensity: 0.18 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.9, roughness: 0.18 });

  const add = (geo, m, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    mesh.castShadow = true;
    grp.add(mesh);
    return mesh;
  };

  let muzzleZ = -0.6;
  if (type.id === 'pistol') {
    add(new THREE.BoxGeometry(0.08, 0.11, 0.34), darkMetal, 0, 0.04, -0.08);
    add(new THREE.BoxGeometry(0.084, 0.04, 0.35), accentMetal, 0, 0.08, -0.08);
    add(new THREE.BoxGeometry(0.07, 0.18, 0.09), darkMetal, 0, -0.07, 0.04, -0.25);
    add(new THREE.CylinderGeometry(0.022, 0.022, 0.12, 10), chrome, 0, 0.05, -0.28, Math.PI / 2);
    muzzleZ = -0.35;
  } else if (type.id === 'smg') {
    add(new THREE.BoxGeometry(0.10, 0.15, 0.48), darkMetal, 0, 0.03, -0.10);
    add(new THREE.BoxGeometry(0.105, 0.04, 0.44), accentMetal, 0, 0.11, -0.10);
    add(new THREE.BoxGeometry(0.055, 0.26, 0.08), chrome, 0, -0.14, -0.16, 0.18);
    add(new THREE.CylinderGeometry(0.035, 0.035, 0.22, 12), darkMetal, 0, 0.04, -0.42, Math.PI / 2);
    add(new THREE.BoxGeometry(0.06, 0.06, 0.14), accentMetal, 0, 0.15, -0.05);
    muzzleZ = -0.54;
  } else if (type.id === 'rifle') {
    add(new THREE.BoxGeometry(0.095, 0.14, 0.68), darkMetal, 0, 0.03, -0.12);
    add(new THREE.BoxGeometry(0.10, 0.035, 0.58), accentMetal, 0, 0.11, -0.15);
    add(new THREE.BoxGeometry(0.065, 0.24, 0.10), darkMetal, 0, -0.12, -0.14, 0.24);
    add(new THREE.BoxGeometry(0.08, 0.12, 0.26), darkMetal, 0, 0.01, 0.30);
    add(new THREE.CylinderGeometry(0.026, 0.03, 0.36, 12), chrome, 0, 0.05, -0.60, Math.PI / 2);
    add(new THREE.BoxGeometry(0.075, 0.075, 0.18), accentMetal, 0, 0.16, -0.06);
    muzzleZ = -0.79;
  } else if (type.id === 'shotgun') {
    add(new THREE.BoxGeometry(0.11, 0.13, 0.64), darkMetal, 0, 0.03, -0.10);
    add(new THREE.CylinderGeometry(0.034, 0.034, 0.72, 12), chrome, 0, 0.07, -0.35, Math.PI / 2);
    add(new THREE.CylinderGeometry(0.028, 0.028, 0.62, 12), darkMetal, 0, 0.02, -0.30, Math.PI / 2);
    add(new THREE.CylinderGeometry(0.048, 0.048, 0.24, 12), accentMetal, 0, 0.01, -0.34, Math.PI / 2);
    add(new THREE.BoxGeometry(0.09, 0.14, 0.30), accentMetal, 0, -0.01, 0.32);
    muzzleZ = -0.73;
  } else {
    // Sniper L96 com luneta longa e bipé
    add(new THREE.BoxGeometry(0.10, 0.14, 0.85), accentMetal, 0, 0.02, -0.08);
    add(new THREE.CylinderGeometry(0.026, 0.034, 0.68, 12), chrome, 0, 0.06, -0.78, Math.PI / 2);
    add(new THREE.CylinderGeometry(0.045, 0.04, 0.42, 14), darkMetal, 0, 0.16, -0.14, Math.PI / 2);
    add(new THREE.CylinderGeometry(0.058, 0.045, 0.12, 14), accentMetal, 0, 0.16, -0.38, Math.PI / 2);
    add(new THREE.BoxGeometry(0.08, 0.15, 0.32), darkMetal, 0, 0.0, 0.42);
    muzzleZ = -1.14;
  }

  // Se for visão em 1ª pessoa, adiciona as mãos/luvas táticas segurando a arma
  if (isFirstPersonView) {
    const gloveMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.6 });
    const sleeveMat = new THREE.MeshStandardMaterial({ color: skinConfigs[Number(document.getElementById('skinChoice')?.value || 0)].primary, roughness: 0.45 });
    const rightHand = add(new THREE.SphereGeometry(0.065, 10, 10), gloveMat, 0.02, -0.09, 0.08);
    const rightArm = add(new THREE.CylinderGeometry(0.055, 0.068, 0.38, 10), sleeveMat, 0.08, -0.22, 0.28, 0.95, 0, -0.2);
    const leftHand = add(new THREE.SphereGeometry(0.062, 10, 10), gloveMat, -0.04, -0.04, -0.24);
    const leftArm = add(new THREE.CylinderGeometry(0.052, 0.065, 0.42, 10), sleeveMat, -0.18, -0.18, -0.05, 1.15, 0, 0.35);
    rightHand.castShadow = rightArm.castShadow = leftHand.castShadow = leftArm.castShadow = false;
  }

  const flash = add(new THREE.SphereGeometry(0.09, 8, 8), new THREE.MeshBasicMaterial({ color: 0xfef08a }), 0, 0.06, muzzleZ);
  flash.scale.set(1, 1, 2.2);
  flash.visible = false;
  grp.userData.muzzle = flash;
  return grp;
}

// Arma em 3ª pessoa acoplada ao jogador
const thirdPersonGunHolder = new THREE.Group();
thirdPersonGunHolder.position.set(0.36, 1.38, -0.35);
player.add(thirdPersonGunHolder);

// Viewmodel em 1ª pessoa acoplado à câmera
const fpWeaponRig = new THREE.Group();
camera.add(fpWeaponRig);
scene.add(camera);

let tpWeaponMesh = null;
let fpWeaponMesh = null;

function rebuildWeaponModels() {
  if (tpWeaponMesh) thirdPersonGunHolder.remove(tpWeaponMesh);
  if (fpWeaponMesh) fpWeaponRig.remove(fpWeaponMesh);
  tpWeaponMesh = null;
  fpWeaponMesh = null;
  if (!weapon) return;

  tpWeaponMesh = createWeaponMesh(weapon, false);
  thirdPersonGunHolder.add(tpWeaponMesh);

  fpWeaponMesh = createWeaponMesh(weapon, true);
  fpWeaponMesh.position.set(0.26, -0.24, -0.48);
  fpWeaponRig.add(fpWeaponMesh);
}

function applySkin(index) {
  const cfg = skinConfigs[index] || skinConfigs[0];
  player.remove(heroRig.root);
  heroRig = buildArticulatedCharacter(cfg, false);
  heroRig.root.visible = !firstPerson && !aiming;
  player.add(heroRig.root);
  attachHumanModel(heroRig.root, playerGlbMixers);
  if (weapon) rebuildWeaponModels();
}

// --- VARIÁVEIS DE JOGO E ESTADO ---
player.position.set(0, 28, 0);
let verticalSpeed = 0, onGround = true, animClock = 0;
let yaw = 0, pitch = -0.12, firstPerson = false, stepSoundTimer = 0, health = 100, kills = 0, ammo = 0, elapsed = 0;
let playing = false, ended = false, shooting = false, reloadTimer = 0;
let career={wins:0,kills:0,matches:0};
try{career={...career,...JSON.parse(localStorage.getItem('ilhaRoyaleCareer')||'{}')}}catch(e){}
function saveCareer(){try{localStorage.setItem('ilhaRoyaleCareer',JSON.stringify(career))}catch(e){}}
function refreshCareer(){for(const [id,key] of [['statWins','wins'],['statKills','kills'],['statMatches','matches']]){const el=document.getElementById(id);if(el)el.textContent=career[key]||0}}
refreshCareer();
let weapon = null, shotCooldown = 0, muzzleTimer = 0, nearestLoot = null, nearestMedkit = null;
let inventory = [null, null], activeSlot = 0, inventoryOpen = false, reviveUsed = false;
let hasMedkit = false, healingProgress = 0, isHoldingHeal = false;
let dropActive = false, dropTime = 0, planePhase = true, gelCooldown = 0;
let currentFov = 70;
let fpBob = 0, fpSway = 0;
const gelWalls = [];

// --- AVIÃO VISÍVEL CRUZANDO O MAPA DEVAGAR ---
const plane = new THREE.Group();
scene.add(plane);
const fuselageMat=mat(0xdce7ec,.42), wingMat=mat(0x9eafb9,.48), trimPlaneMat=mat(0x087f9d,.38), glassPlaneMat=new THREE.MeshStandardMaterial({color:0x163c50,metalness:.62,roughness:.16,emissive:0x082b3a,emissiveIntensity:.16});
const planeFuselage = new THREE.Mesh(new THREE.CylinderGeometry(1.08, 0.94, 11.8, 20), fuselageMat);
planeFuselage.rotation.z = Math.PI / 2; planeFuselage.castShadow=true;
const planeNose = new THREE.Mesh(new THREE.SphereGeometry(1.02,18,12), trimPlaneMat); planeNose.scale.set(1.35,.88,.88); planeNose.position.x=6.05;
const planeTailCone=new THREE.Mesh(new THREE.ConeGeometry(.94,2.4,18),fuselageMat);planeTailCone.rotation.z=Math.PI/2;planeTailCone.position.x=-7.0;
const planeWing = new THREE.Mesh(new THREE.BoxGeometry(2.8,.24,17), wingMat);planeWing.castShadow=true;
const planeTail = new THREE.Mesh(new THREE.BoxGeometry(1.5,2.45,.32), trimPlaneMat);planeTail.position.set(-5.65,1.35,0);
const planeStabilizer=new THREE.Mesh(new THREE.BoxGeometry(1.4,.18,6.2),wingMat);planeStabilizer.position.set(-5.35,.75,0);
plane.add(planeFuselage,planeNose,planeTailCone,planeWing,planeTail,planeStabilizer);
for(const side of [-1,1]){
 const engine=new THREE.Mesh(new THREE.CylinderGeometry(.52,.58,2.25,16),mat(0x52636d,.48));engine.rotation.x=Math.PI/2;engine.position.set(.2,-.65,side*4.2);plane.add(engine);
 const intake=new THREE.Mesh(new THREE.CircleGeometry(.43,16),glassPlaneMat);intake.position.set(1.34,-.65,side*4.2);intake.rotation.y=Math.PI/2;plane.add(intake);
 for(let w=0;w<5;w++){const win=new THREE.Mesh(new THREE.BoxGeometry(.055,.36,.58),glassPlaneMat);win.position.set(3.6-w*1.25,.42,side*.94);win.rotation.y=side*.08;plane.add(win);}
 const gear=new THREE.Mesh(new THREE.CylinderGeometry(.07,.07,.85,8),mat(0x35434a));gear.position.set(-.8,-1.2,side*2.2);plane.add(gear);
 const wheel=new THREE.Mesh(new THREE.TorusGeometry(.22,.09,8,14),mat(0x17212a));wheel.position.set(-.8,-1.63,side*2.2);wheel.rotation.y=Math.PI/2;plane.add(wheel);
}
const stripe=new THREE.Mesh(new THREE.BoxGeometry(8.8,.12,.025),trimPlaneMat);stripe.position.set(-.2,.35,1.02);plane.add(stripe);

const parachute = new THREE.Group();
scene.add(parachute);
const canopy = new THREE.Mesh(new THREE.SphereGeometry(2.9, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xef4444));
canopy.position.y = 4.2; parachute.add(canopy);
parachute.visible = false;

// --- BOTS QUE CAEM DE PARAQUEDAS JUNTO COM O JOGADOR ---
const bots = [];
function spawnAllBotsInPlane() {
  bots.forEach(b => scene.remove(b.g));
  bots.length = 0;
  for (let i = 0; i < 10; i++) {
    const cfg = skinConfigs[i % skinConfigs.length];
    const rig = buildArticulatedCharacter(cfg, true);
    rig.root.position.set(plane.position.x - 4 - i * 2, 34, plane.position.z + (Math.random() - 0.5) * 14);
    scene.add(rig.root);

    const botChute = new THREE.Mesh(new THREE.SphereGeometry(2.2, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat([0x3b82f6, 0x10b981, 0xf59e0b, 0xec4899][i % 4]));
    botChute.position.y = 3.6;
    rig.root.add(botChute);

    const botObj = {
      g: rig.root,
      rig: rig,
      chute: botChute,
      jumpingAt: 1.5 + i * 1.4,
      inPlane: true,
      parachuting: false,
      targetLandX: (Math.random() - 0.5) * 175,
      targetLandZ: (Math.random() - 0.5) * 175,
      hp: 100,
      kills: 0,
      name: ['Raptor','Echo','Mako','Nova','Blitz','Raven','Atlas','Ghost','Cobra','Orion'][i],
      velX: 0, velZ: 0,
      shot: 0.8 + Math.random() * 1.8,
      phase: Math.random() * 6,
      strafeDir: Math.random() < 0.5 ? -1 : 1,
      strafeTimer: 0.8 + Math.random() * 1.8,
      deathAnim: 0,
      weapon: weaponTypes[i % weaponTypes.length]
    };
    rig.root.traverse(m => { if (m.isMesh) m.userData.botRef = botObj; });
    bots.push(botObj);
  }
  document.getElementById('bots').textContent = bots.length;
}

// --- LOOT DE ARMAS E KITS MÉDICOS ---
const loots = [], medkits = [];
function spawnMedkit(x, z) {
  const g = new THREE.Group(), boxMat = mat(0xf8fafc), crossMat = mat(0xef4444);
  const caseMesh = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.42, 0.62), boxMat); caseMesh.position.y = 0.35; g.add(caseMesh);
  const h = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.08), crossMat); h.position.set(0, 0.58, 0); g.add(h);
  const vert = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.42), crossMat); vert.position.set(0, 0.58, 0); g.add(vert);
  g.position.set(x, 0, z); scene.add(g); medkits.push(g);
}
for (let i = 0; i < 16; i++) {
  const a = Math.random() * Math.PI * 2, r = 10 + Math.random() * 125;
  spawnMedkit(Math.cos(a) * r, Math.sin(a) * r);
}

function spawnLoot(x, z, typeIndex) {
  const type = weaponTypes[typeIndex], group = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.65, 0.12, 16), mat(0x1e293b)); base.position.y = 0.08; group.add(base);
  const mesh = createWeaponMesh(type, false);
  mesh.position.y = 0.45;
  group.add(mesh);
  const glow = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.045, 6, 20), new THREE.MeshBasicMaterial({ color: type.color }));
  glow.rotation.x = Math.PI / 2; glow.position.y = 0.18; group.add(glow);
  group.position.set(x, 0, z); scene.add(group); loots.push({ group, typeIndex, type });
}
for (let i = 0; i < 34; i++) {
  const a = Math.random() * Math.PI * 2, r = 8 + Math.random() * 128;
  spawnLoot(Math.cos(a) * r, Math.sin(a) * r, i % weaponTypes.length);
}

function updateMedkitHud() {
  const badge = document.getElementById('medkitBadge');
  badge.textContent = `Kit Médico: ${hasMedkit ? '1/1 [Segure B]' : '0/1'}`;
  badge.classList.toggle('has-kit', hasMedkit);
  document.getElementById('healBtn').style.display = hasMedkit ? 'block' : 'none';
}

function renderInventory() {
  const el = document.getElementById('slots'); el.innerHTML = '';
  inventory.forEach((item, i) => {
    const d = document.createElement('div');
    d.className = 'slot' + (i === activeSlot ? ' active' : '');
    d.textContent = (i + 1) + '. ' + (item ? item.type.name + ' · ' + item.ammo + '/' + item.type.mag : 'Vazio');
    el.appendChild(d);
  });
  document.getElementById('inventory').classList.toggle('open', inventoryOpen);
}
function updateWeaponHud() {
  document.getElementById('ammo').textContent = weapon ? ammo + '/' + weapon.mag : '0';
  document.getElementById('weaponName').textContent = weapon ? weapon.name : 'Sem arma';
}
function reload() {
  if (weapon && ammo < weapon.mag && reloadTimer <= 0) {
    ensureAudio(); sfx('reload'); reloadTimer = 1.4;
  }
}
function finishReload() {
  if (weapon) {
    ammo = weapon.mag;
    if (inventory[activeSlot]) inventory[activeSlot].ammo = ammo;
    updateWeaponHud(); renderInventory();
  }
}
function toggleNearbyDoor() {
  let best = null, bd = 3.4;
  for (const d of doors) {
    const dist = Math.hypot(player.position.x - d.x, player.position.z - d.z);
    if (dist < bd) { bd = dist; best = d; }
  }
  if (best) {
    best.open = !best.open;
    ensureAudio(); sfx('door');
  }
}
function syncActive() {
  const item = inventory[activeSlot];
  weapon = item ? item.type : null;
  ammo = item ? item.ammo : 0;
  if (!weapon) setAim(false);
  rebuildWeaponModels();
  updateWeaponVisibility();
  updateWeaponHud();
  renderInventory();
}
function updateWeaponVisibility() {
  if (tpWeaponMesh) tpWeaponMesh.visible = !!weapon && !firstPerson && !aiming;
  if (fpWeaponMesh) fpWeaponMesh.visible = !!weapon && firstPerson && !aiming;
}
function switchWeapon(i) {
  if (i < 0 || i > 1 || !inventory[i]) return;
  if (weapon && inventory[activeSlot]) inventory[activeSlot].ammo = ammo;
  activeSlot = i; syncActive();
}

function pickupLoot() {
  if (!playing) return;
  if (nearestMedkit) {
    if (hasMedkit) {
      const msg = document.getElementById('pickupMsg');
      msg.textContent = 'Você já carrega 1 Kit Médico (Segure B para usar)';
      setTimeout(() => msg.textContent = '', 1600);
      return;
    }
    hasMedkit = true;
    updateMedkitHud();
    scene.remove(nearestMedkit);
    medkits.splice(medkits.indexOf(nearestMedkit), 1);
    nearestMedkit = null;
    ensureAudio(); sfx('pickup');
    document.getElementById('pickup').style.display = 'none';
    const msg = document.getElementById('pickupMsg');
    msg.textContent = '🩹 Pegou Kit Médico! Segure [B] por 2s para curar';
    setTimeout(() => msg.textContent = '', 1800);
    return;
  }
  if (!nearestLoot) return;
  ensureAudio(); sfx('pickup');
  let slot = inventory.findIndex(v => v === null);
  if (slot < 0) slot = 1 - activeSlot;
  inventory[slot] = { type: nearestLoot.type, ammo: nearestLoot.type.mag };
  activeSlot = slot;
  syncActive();
  const picked = nearestLoot;
  scene.remove(picked.group);
  loots.splice(loots.indexOf(picked), 1);
  nearestLoot = null;
  document.getElementById('pickup').style.display = 'none';
  const msg = document.getElementById('pickupMsg');
  msg.textContent = '🔫 Equipou: ' + weapon.name;
  setTimeout(() => msg.textContent = '', 1400);
}

// --- ZONA SEGURA E GÁS ---
let zoneR = 135;
const zone = new THREE.Mesh(new THREE.TorusGeometry(1, 0.25, 10, 140), new THREE.MeshBasicMaterial({ color: 0x38bdf8 }));
zone.rotation.x = Math.PI / 2; zone.position.y = 0.2; scene.add(zone);
const gasWall = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 22, 140, 1, true), new THREE.MeshBasicMaterial({ color: 0x4ade80, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }));
gasWall.position.y = 10.5; scene.add(gasWall);

// --- ÁUDIO SINTETIZADO ---
let audioCtx = null;
function ensureAudio() {
  if (!audioCtx) { const AC = window.AudioContext || window.webkitAudioContext; if (AC) audioCtx = new AC(); }
  if (audioCtx?.state === 'suspended') audioCtx.resume();
}
function sfx(kind) {
  if (!audioCtx) return;
  const now = audioCtx.currentTime, osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
  const cfg = {
    door: [150, 'triangle', 0.16, 0.05],
    punch: [90, 'sawtooth', 0.12, 0.06],
    shot: [130, 'sawtooth', 0.14, 0.065],
    headshot: [980, 'sine', 0.14, 0.08],
    pickup: [660, 'sine', 0.16, 0.07],
    heal: [520, 'sine', 0.28, 0.08],
    reload: [320, 'triangle', 0.22, 0.045],
    jump: [240, 'sine', 0.18, 0.045],
    step: [85, 'triangle', 0.07, 0.018],
    hit: [280, 'triangle', 0.12, 0.06]
  };
  const c = cfg[kind] || cfg.step;
  osc.type = c[1]; osc.frequency.setValueAtTime(c[0], now);
  osc.frequency.exponentialRampToValueAtTime(Math.max(35, c[0] * 0.55), now + c[2]);
  gain.gain.setValueAtTime(c[3], now); gain.gain.exponentialRampToValueAtTime(0.001, now + c[2]);
  osc.connect(gain); gain.connect(audioCtx.destination); osc.start(now); osc.stop(now + c[2] + 0.01);
}

function deployGel() {
  if (!playing || ended || planePhase || gelCooldown > 0) return;
  gelCooldown = 4;
  const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  const wall = new THREE.Group();
  const gelMat = new THREE.MeshPhysicalMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.72, roughness: 0.22 });
  for (let i = 0; i < 3; i++) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(1.25, 2.5, 0.22), gelMat);
    panel.position.set((i - 1) * 1.18, 1.25, 0); panel.castShadow = true; wall.add(panel);
  }
  wall.position.set(player.position.x + forward.x * 2.5, 0, player.position.z + forward.z * 2.5);
  wall.rotation.y = yaw; scene.add(wall);
  gelWalls.push({ wall, life: 18, x: wall.position.x, z: wall.position.z });
  ensureAudio(); sfx('pickup');
  document.getElementById('pickupMsg').textContent = '🛡️ PAREDE DE GEL!';
  setTimeout(() => document.getElementById('pickupMsg').textContent = '', 900);
}

function toggleView() {
  firstPerson = !firstPerson;
  document.body.classList.toggle('first-person', firstPerson);
  document.getElementById('viewToggle').textContent = firstPerson ? '3ª PESSOA' : '1ª PESSOA';
  heroRig.root.visible = !firstPerson && !aiming;
  updateWeaponVisibility();
}

function resolvePlayerCollision(nx, nz) {
  const r = 0.62; let x = nx, z = nz;
  for (const t of solidTrees) {
    const dx = x - t.x, dz = z - t.z, d = Math.hypot(dx, dz), min = r + t.r;
    if (d < min) { const k = (min - d) / (d || 1); x += dx / (d || 1) * k; z += dz / (d || 1) * k; }
  }
  for (const b of solidBuildings) {
    const dx = x - b.x, dz = z - b.z;
    const openDoor = doors.some(d => d.open && Math.abs(x - d.x) < 0.85 && Math.abs(z - d.z) < 1.35);
    const insideInterior = b.interior && Math.abs(dx) < b.hx - 0.35 && Math.abs(dz) < b.hz - 0.35;
    if (!insideInterior && !openDoor && Math.abs(dx) < b.hx + r && Math.abs(dz) < b.hz + r) {
      const ox = b.hx + r - Math.abs(dx), oz = b.hz + r - Math.abs(dz);
      if (ox < oz) x += Math.sign(dx || 1) * ox; else z += Math.sign(dz || 1) * oz;
    }
  }
  return { x, z };
}

let crouching = false, aiming = false, parkourFlash = 0, lastJumpAt = -10, flipTimer = 0;
let stamina=100, sprintTouch=false;
function setAim(v) {
  aiming = !!v && !!weapon && !planePhase;
  document.body.classList.toggle('aiming', aiming);
  document.getElementById('aimToggle').classList.toggle('active', aiming);
  document.getElementById('aimToggle').textContent = aiming ? 'MIRANDO' : 'MIRA';
  heroRig.root.visible = !firstPerson && !aiming;
  updateWeaponVisibility();
}
document.getElementById('aimToggle').addEventListener('click', () => setAim(!aiming));
function setCrouch(v) {
  crouching = !!v;
  document.body.classList.toggle('crouching', crouching);
  document.getElementById('crouch').textContent = crouching ? 'LEVANTAR' : 'AGACHAR';
}

// --- TECLADO ---
const keys = {};
addEventListener('keydown', e => {
  if (!keys[e.code]) {
    if (e.code === 'KeyR') reload();
    if (e.code === 'KeyG') deployGel();
    if (e.code === 'Space' && planePhase) jumpFromPlane();
    if (e.code === 'KeyV') toggleView();
    if (e.code === 'KeyC') setCrouch(!crouching);
    if (e.code === 'KeyF' || e.code === 'Enter') shoot();
    if (e.code === 'KeyE') { pickupLoot(); toggleNearbyDoor(); }
    if (e.code === 'KeyQ') switchWeapon(1 - activeSlot);
    if (e.code === 'Digit1') switchWeapon(0);
    if (e.code === 'Digit2') switchWeapon(1);
    if (e.code === 'Tab') { e.preventDefault(); inventoryOpen = !inventoryOpen; renderInventory(); }
  }
  keys[e.code] = true;
});
addEventListener('keyup', e => {
  keys[e.code] = false;
  if (e.code === 'Tab') renderInventory();
});

// --- CONTROLES DE MOUSE ALTA SENSIBILIDADE E TOQUE ---
let pointer = false, lastMouseX = 0, lastMouseY = 0;
const stick = { x: 0, y: 0 }, look = { x: 0, y: 0 };
const canvas = renderer.domElement;
canvas.style.touchAction = 'none';
canvas.addEventListener('contextmenu', e => e.preventDefault());

function tryRequestPointerLock() {
  if (playing && !ended && canvas.requestPointerLock) {
    try {
      const p = canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    } catch (_) {}
  }
}

canvas.addEventListener('mouseenter', () => { if (playing && !ended) tryRequestPointerLock(); });
canvas.addEventListener('pointerdown', e => {
  ensureAudio();
  if (!playing || ended) return;
  if (e.pointerType !== 'touch') tryRequestPointerLock();
  if (e.button === 0) { shooting = true; shoot(); }
  else if (e.button === 2) { setAim(!aiming); }
});
addEventListener('pointerup', e => { if (e.button === 0) shooting = false; });

document.addEventListener('pointerlockchange', () => {
  pointer = document.pointerLockElement === canvas;
  document.body.style.cursor = pointer ? 'none' : 'default';
  canvas.style.cursor = pointer ? 'none' : 'crosshair';
  document.getElementById('lockHint').style.opacity = (playing && !ended && !pointer && !('ontouchstart' in window)) ? '1' : '0';
});

// Câmera mais sensível e responsiva em 360 graus
document.addEventListener('mousemove', e => {
  if (!playing || ended) return;
  const sens = aiming ? 0.0032 : 0.0085;
  if (pointer) {
    yaw -= e.movementX * sens;
    pitch = Math.max(-0.82, Math.min(0.58, pitch - e.movementY * (sens * 0.85)));
  } else {
    if (lastMouseX !== 0 || lastMouseY !== 0) {
      const dx = e.clientX - lastMouseX;
      const dy = e.clientY - lastMouseY;
      yaw -= dx * (sens * 1.15);
      pitch = Math.max(-0.82, Math.min(0.58, pitch - dy * (sens * 0.9)));
    }
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    tryRequestPointerLock();
  }
});
canvas.addEventListener('mouseleave', () => { lastMouseX = 0; lastMouseY = 0; });

function setupPad(id, obj, isLook) {
  const el = document.getElementById(id), knob = el.querySelector('.knob');
  el.addEventListener('pointerdown', e => { el.setPointerCapture(e.pointerId); obj.pid = e.pointerId; updatePad(e); });
  el.addEventListener('pointermove', e => { if (obj.pid === e.pointerId) updatePad(e); });
  function updatePad(e) {
    const r = el.getBoundingClientRect(), dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2), max = 42, len = Math.hypot(dx, dy), k = Math.min(1, max / (len || 1));
    knob.style.transform = `translate(${dx * k}px,${dy * k}px)`; obj.x = dx * k / max; obj.y = dy * k / max;
    if (isLook) { yaw -= obj.x * 0.075; pitch = Math.max(-0.82, Math.min(0.58, pitch - obj.y * 0.048)); }
  }
  function endPad(e) { if (obj.pid === e.pointerId) { obj.pid = null; obj.x = obj.y = 0; knob.style.transform = ''; } }
  el.addEventListener('pointerup', endPad); el.addEventListener('pointercancel', endPad);
}
setupPad('stick', stick, false);
setupPad('look', look, true);
document.getElementById('viewToggle').addEventListener('click', toggleView);
const sprintButton=document.getElementById('sprintTouch');
sprintButton.addEventListener('pointerdown',e=>{e.preventDefault();sprintTouch=true;sprintButton.setPointerCapture?.(e.pointerId);});
['pointerup','pointercancel','lostpointercapture'].forEach(ev=>sprintButton.addEventListener(ev,()=>sprintTouch=false));
document.getElementById('crouch').addEventListener('click', () => setCrouch(!crouching));
document.getElementById('gel').addEventListener('click', deployGel);
document.getElementById('jump').addEventListener('click', jumpFromPlane);
document.getElementById('pickup').addEventListener('click', pickupLoot);
document.getElementById('fire').addEventListener('pointerdown', e => { e.preventDefault(); ensureAudio(); shooting = true; shoot(); });
document.getElementById('fire').addEventListener('pointerup', () => { shooting = false; });
document.getElementById('healBtn').addEventListener('pointerdown', () => { isHoldingHeal = true; });
document.getElementById('healBtn').addEventListener('pointerup', () => { isHoldingHeal = false; });

function showHitmarker(isCrit) {
  const hm = document.getElementById('hitmarker');
  hm.className = isCrit ? 'crit' : '';
  hm.style.display = 'block';
  setTimeout(() => { hm.style.display = 'none'; }, 180);
}

// --- BALÍSTICA, TRAÇANTES E RECUO EM 1ª PESSOA ---
const tracers = [], sparks = [];
let fpRecoilZ = 0, fpRecoilPitch = 0;

function spawnTracer(startPos, endPos, color = 0x5eead4) {
  const geo = new THREE.BufferGeometry().setFromPoints([startPos.clone(), endPos.clone()]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.92 }));
  scene.add(line); tracers.push({ line, life: 0.14 });
}
function spawnImpactSparks(pos, isCrit = false) {
  const count = isCrit ? 12 : 6, col = isCrit ? 0xef4444 : 0xfacc15;
  for (let i = 0; i < count; i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 6), new THREE.MeshBasicMaterial({ color: col }));
    m.position.copy(pos); scene.add(m);
    sparks.push({ mesh: m, vel: new THREE.Vector3((Math.random() - 0.5) * 7, 1.5 + Math.random() * 5, (Math.random() - 0.5) * 7), life: 0.28 + Math.random() * 0.15 });
  }
}

const shotRay = new THREE.Raycaster();
function shoot() {
  if (planePhase) return;
  if (!weapon) { punch(); return; }
  if (!playing || ended || reloadTimer > 0 || shotCooldown > 0) return;
  if (ammo <= 0) { reload(); return; }

  ensureAudio(); sfx('shot'); ammo--;
  if (inventory[activeSlot]) inventory[activeSlot].ammo = ammo;
  shotCooldown = weapon.rate;
  updateWeaponHud(); renderInventory();

  // Efeitos de flash e recuo realista
  muzzleTimer = 0.065;
  if (tpWeaponMesh?.userData.muzzle) tpWeaponMesh.userData.muzzle.visible = true;
  if (fpWeaponMesh?.userData.muzzle) fpWeaponMesh.userData.muzzle.visible = true;
  fpRecoilZ = weapon.recoilKick;
  fpRecoilPitch = weapon.recoilPitch * 2.5;
  pitch = Math.min(0.58, pitch + (aiming ? weapon.recoilPitch * 0.75 : weapon.recoilPitch));

  shotRay.setFromCamera(new THREE.Vector2(0, 0), camera);
  const muzzleOrigin = new THREE.Vector3(player.position.x, player.position.y + 1.48, player.position.z);
  const defaultEnd = shotRay.ray.origin.clone().addScaledVector(shotRay.ray.direction, 130);

  const botMeshes = [];
  bots.forEach(b => { if (b.hp > 0) b.g.traverse(m => { if (m.isMesh && m !== b.chute) botMeshes.push(m); }); });
  const hits = shotRay.intersectObjects(botMeshes, false);

  if (hits.length > 0) {
    const hit = hits[0];
    const bot = hit.object.userData.botRef;
    const part = hit.object.userData.hitPart || 'torso';
    spawnTracer(muzzleOrigin, hit.point, weapon.color);
    if (bot && bot.hp > 0) {
      let dmg = weapon.damage, isCrit = false;
      if (part === 'head') {
        dmg = Math.round(weapon.damage * 2.4); isCrit = true; sfx('headshot');
        const msg = document.getElementById('pickupMsg');
        msg.textContent = `🎯 HEADSHOT CRÍTICO! (-${dmg} HP)`;
        setTimeout(() => msg.textContent = '', 1200);
      } else if (part === 'limb') {
        dmg = Math.round(weapon.damage * 0.75); sfx('hit');
      } else {
        sfx('hit');
      }
      spawnImpactSparks(hit.point, isCrit);
      showHitmarker(isCrit);
      bot.hp -= dmg;
      if (bot.hp <= 0) {
        kills++;
        document.getElementById('kills').textContent = kills;

        document.getElementById('bots').textContent = bots.filter(b => b.hp > 0).length;
        checkWin();
      }
    }
  } else {
    spawnTracer(muzzleOrigin, defaultEnd, weapon.color);
  }
}

function punch() {
  if (!playing || ended || shotCooldown > 0) return;
  shotCooldown = 0.35; ensureAudio(); sfx('punch');
  const origin = new THREE.Vector3(player.position.x, 1.45, player.position.z);
  const dir = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  let target = null, best = 2.6;
  for (const b of bots) {
    if (b.hp <= 0) continue;
    const v = b.g.position.clone().add(new THREE.Vector3(0, 1, 0)).sub(origin);
    const d = v.length();
    if (d < best && dir.dot(new THREE.Vector3(v.x, 0, v.z).normalize()) > 0.5) { target = b; best = d; }
  }
  if (target) {
    target.hp -= 25; sfx('hit');
    if (target.hp <= 0) {
      kills++; document.getElementById('kills').textContent = kills;
      document.getElementById('bots').textContent = bots.filter(b => b.hp > 0).length;
      checkWin();
    }
  }
}

function checkWin() { if (bots.every(b => b.hp <= 0)) finish(true); }
function finish(win) {
  if (ended) return; ended = true; setAim(false); document.exitPointerLock?.();
  career.matches=(career.matches||0)+1; career.kills=(career.kills||0)+kills; if(win)career.wins=(career.wins||0)+1; saveCareer(); refreshCareer();
  document.getElementById('message').textContent = win ? '🏆 VITÓRIA ROYALE!' : 'VOCÊ FOI ELIMINADO';
  document.getElementById('restart').style.display = 'block';
  if (!win) document.getElementById('revive').style.display = reviveUsed ? 'none' : 'block';
}

// --- SALTO DO AVIÃO E EJEÇÃO AUTOMÁTICA NO GÁS ---
let playerVelX = 0, playerVelZ = 0, landingImpact = 0;
function jumpFromPlane(forcedByGas = false) {
  if (!playing || !planePhase) return;
  planePhase = false;
  dropActive = true;
  dropTime = 0;
  player.position.set(plane.position.x, 36, plane.position.z);
  verticalSpeed = -2;
  parachute.visible = true;
  document.getElementById('jump').style.display = 'none';
  document.getElementById('dropHint').textContent = forcedByGas
    ? '⚠️ FIM DA ROTA! EXPULSO DO AVIÃO — ABRA O PARAQUEDAS!'
    : '🪂 CAINDO DE PARAQUEDAS! CONTROLE SUA DESCIDA';
  ensureAudio(); sfx('jump');
}

// --- LOOP DE ATUALIZAÇÃO PRINCIPAL ---


// --- MODELOS GLB DE CENÁRIO (CC0): vegetação, rochas e formações naturais ---
const environmentGlbAssets = [
  {url:'https://gobkit.com/freebies/environment/TreeHigh001.glb', positions:[[-42,0,-48],[38,0,-62],[72,0,28],[-78,0,36],[12,0,94]] , scale:1.0},
  {url:'https://gobkit.com/freebies/environment/Rock001.glb', positions:[[-28,0,18],[44,0,42],[88,0,-12],[-96,0,-18],[6,0,-112]], scale:1.0},
  {url:'https://gobkit.com/freebies/environment/Bush001.glb', positions:[[-18,0,-38],[25,0,54],[62,0,12],[-64,0,-6],[4,0,72]], scale:1.0},
  {url:'https://gobkit.com/freebies/environment/Cliff001.glb', positions:[[-118,0,0],[112,0,16],[0,0,118]], scale:1.0}
];
function loadEnvironmentGLB() {
  for (const asset of environmentGlbAssets) {
    loadGLB(asset.url).then(gltf => {
      const source = gltf.scene;
      for (const [x,y,z] of asset.positions) {
        const clone = source.clone(true);
        clone.position.set(x,y,z);
        clone.scale.multiplyScalar(asset.scale);
        clone.rotation.y = (x*z % 5) * 0.2;
        clone.traverse(o => { if(o.isMesh){o.castShadow=false;o.receiveShadow=true;} });
        scene.add(clone);
      }
    }).catch(err => console.warn('Prop GLB indisponível:', asset.url, err));
  }
}
loadEnvironmentGLB();

function update(dt) {
  for(const mixer of playerGlbMixers) mixer.update(dt);
  if (!playing || ended) return;
  elapsed += dt;
  document.getElementById('time').textContent = new Date(elapsed * 1000).toISOString().slice(14, 19);

  // Nuvens se movem; o mar fica parado ao redor da ilha, sem avançar sobre o mapa.
  for (const c of clouds) {
    c.grp.position.x += c.speed * dt;
    if (c.grp.position.x > 210) c.grp.position.x = -210;
  }
  // Ondas oceânicas pequenas e contínuas, com espuma costeira discreta.
  const waterAttr = waterGeo.attributes.position;
  const waterTime = elapsed;
  for (let i = 0; i < waterAttr.count; i++) {
    const x = waterAttr.getX(i), z = waterAttr.getZ(i);
    const radius = Math.hypot(x, z);
    const wave = Math.sin(x * 0.027 + waterTime * 0.85) * 0.10 + Math.cos(z * 0.022 - waterTime * 0.62) * 0.075 + Math.sin((x + z) * 0.014 + waterTime * 0.45) * 0.045;
    waterAttr.setY(i, wave);
  }
  waterAttr.needsUpdate = true;
  if (Math.floor(elapsed * 12) !== Math.floor((elapsed - dt) * 12)) waterGeo.computeVertexNormals();
  for (const t of swayingTrees) {
    t.phase += dt * 0.7;
    t.crown.rotation.z = Math.sin(t.phase) * t.strength;
    t.crown.rotation.x = Math.cos(t.phase * 0.82) * t.strength * 0.7;
  }
  for (const ring of seaRings) { ring.rotation.z += dt * 0.006; }
  for (const d of doors) {
    d.openAmount = THREE.MathUtils.damp(d.openAmount, d.open ? Math.PI / 2 : 0, 8, dt);
    d.hinge.rotation.y = d.openAmount;
  }

  // Traçantes e faíscas
  for (let i = tracers.length - 1; i >= 0; i--) {
    tracers[i].life -= dt;
    tracers[i].line.material.opacity = Math.max(0, tracers[i].life / 0.14);
    if (tracers[i].life <= 0) { scene.remove(tracers[i].line); tracers.splice(i, 1); }
  }
  for (let i = sparks.length - 1; i >= 0; i--) {
    const sp = sparks[i]; sp.life -= dt; sp.vel.y -= 16 * dt;
    sp.mesh.position.addScaledVector(sp.vel, dt);
    sp.mesh.scale.setScalar(Math.max(0.01, sp.life * 3));
    if (sp.life <= 0) { scene.remove(sp.mesh); sparks.splice(i, 1); }
  }

  // Mecânica de Cura: Segurar B por 2 segundos
  const wantHeal = (keys.KeyB || isHoldingHeal) && hasMedkit && health < 100 && !planePhase;
  const healOverlay = document.getElementById('healOverlay');
  if (wantHeal) {
    healingProgress += dt;
    healOverlay.style.display = 'flex';
    document.getElementById('healBarFill').style.width = Math.min(100, (healingProgress / 2.0) * 100) + '%';
    if (healingProgress >= 2.0) {
      healingProgress = 0;
      hasMedkit = false;
      health = Math.min(100, health + 55);
      document.getElementById('healthFill').style.width = health + '%';
      document.getElementById('hpText').textContent = Math.floor(health) + ' / 100';
      updateMedkitHud();
      healOverlay.style.display = 'none';
      ensureAudio(); sfx('heal');
      const msg = document.getElementById('pickupMsg');
      msg.textContent = '💚 CURADO! +55 DE VIDA';
      setTimeout(() => msg.textContent = '', 1500);
    }
  } else {
    healingProgress = Math.max(0, healingProgress - dt * 2.5);
    if (healingProgress <= 0.01) healOverlay.style.display = 'none';
  }

  // FOV Dinâmico (Mira Sniper / Corrida)
  const sprintRequested = (!!keys.ShiftLeft || sprintTouch) && !crouching && !aiming && !wantHeal;
  const running = sprintRequested && stamina>1 && !planePhase;
  const dynamicTargetFov = aiming ? (weapon ? weapon.zoomFov : 22) : (running ? 74 : 68);
  if (Math.abs(currentFov - dynamicTargetFov) > 0.1) {
    currentFov = THREE.MathUtils.lerp(currentFov, dynamicTargetFov, Math.min(1, dt * 14));
    camera.fov = currentFov;
    camera.updateProjectionMatrix();
  }
  document.getElementById('speedLines').style.opacity = (running && !planePhase) ? '1' : '0';

  if (aiming) {
    shotRay.setFromCamera(new THREE.Vector2(0, 0), camera);
    const hits = shotRay.intersectObjects(scene.children, true);
    const valid = hits.find(h => h.distance > 1.5);
    document.getElementById('scopeDist').textContent = valid ? `DIST: ${Math.round(valid.distance)} M` : 'DIST: >350 M';
  }

  if (shotCooldown > 0) shotCooldown -= dt;
  if (muzzleTimer > 0) {
    muzzleTimer -= dt;
    if (muzzleTimer <= 0) {
      if (tpWeaponMesh?.userData.muzzle) tpWeaponMesh.userData.muzzle.visible = false;
      if (fpWeaponMesh?.userData.muzzle) fpWeaponMesh.userData.muzzle.visible = false;
    }
  }
  if (reloadTimer > 0) {
    reloadTimer -= dt;
    if (reloadTimer <= 0) finishReload();
  }

  // Movimentação do Jogador
  let forward = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0) - stick.y;
  let right = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0) + stick.x;
  const len = Math.min(1, Math.hypot(forward, right));
  const moving = len > 0.08;
  if(running && moving) stamina=Math.max(0,stamina-dt*24); else stamina=Math.min(100,stamina+dt*(moving?10:17));
  const sprintActive=running && moving;
  document.getElementById('staminaFill').style.width=stamina+'%';
  document.getElementById('staminaText').textContent=Math.round(stamina)+'%';
  let speed = wantHeal ? 2.0 : (aiming ? 2.8 : (crouching ? 2.45 : (sprintActive ? 8.7 : 5.35)));
  document.getElementById('sprintTouch').style.opacity=stamina<5?'.48':'1';
  let vx = -Math.sin(yaw) * forward + Math.cos(yaw) * right;
  let vz = -Math.cos(yaw) * forward - Math.sin(yaw) * right;
  const targetVX = moving ? vx * speed : 0, targetVZ = moving ? vz * speed : 0;
  const onIce = mapTheme === 'snow' && iceZones.some(p => ((player.position.x-p.x)/p.rx)**2 + ((player.position.z-p.z)/p.rz)**2 < 1);
  // Aceleração com massa/inércia: no gelo o atrito cai bastante e a direção demora a responder.
  const accelResponse = onIce ? (moving ? 1.75 : 0.24) : (moving ? (onGround ? 8.8 : 3.0) : (onGround ? 7.4 : 0.72));
  // Aceleração no chão, controle aéreo reduzido e atrito dependente do material.
  playerVelX = THREE.MathUtils.damp(playerVelX, targetVX, accelResponse, dt);
  playerVelZ = THREE.MathUtils.damp(playerVelZ, targetVZ, accelResponse, dt);
  if (!moving && onGround && !onIce) { const drag=Math.exp(-2.4*dt); playerVelX*=drag; playerVelZ*=drag; }
  if (onIce) {
    const iceSpeed=Math.hypot(playerVelX,playerVelZ);
    if(iceSpeed>10.2){playerVelX*=10.2/iceSpeed;playerVelZ*=10.2/iceSpeed;}
    document.getElementById('pickupMsg').textContent='❄️ GELO! CUIDADO AO VIRAR';
  } else if(document.getElementById('pickupMsg').textContent==='❄️ GELO! CUIDADO AO VIRAR') document.getElementById('pickupMsg').textContent='';

  if (!planePhase && (Math.abs(playerVelX) + Math.abs(playerVelZ) > 0.03)) {
    const proposed = resolvePlayerCollision(player.position.x + playerVelX * dt, player.position.z + playerVelZ * dt);
    player.position.x = proposed.x; player.position.z = proposed.z;
    const moveFacing = aiming ? yaw : Math.atan2(-vx, -vz);
    const angleDiff = ((moveFacing - player.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    player.rotation.y += angleDiff * Math.min(1, dt * 11);
    stepSoundTimer -= dt;
    if (stepSoundTimer <= 0 && onGround) { ensureAudio(); sfx('step'); stepSoundTimer = running ? 0.23 : 0.37; }
  } else if (aiming) {
    player.rotation.y = yaw;
  }

  player.position.x = Math.max(-MAP_RADIUS + 4, Math.min(MAP_RADIUS - 4, player.position.x));
  player.position.z = Math.max(-MAP_RADIUS + 4, Math.min(MAP_RADIUS - 4, player.position.z));

  // Pulo & Parkour
  if (keys.Space && onGround && !dropActive && !planePhase) {
    const parkour = (running || len > 0.82) && moving;
    verticalSpeed = parkour ? 9.1 : 7.65;
    if (parkour) {
      playerVelX += vx * 2.6; playerVelZ += vz * 2.6; parkourFlash = 1.1;
      document.getElementById('parkourHint').textContent = 'PARKOUR!';
      document.getElementById('parkourHint').style.opacity = '1';
    }
    lastJumpAt = elapsed; onGround = false; ensureAudio(); sfx('jump');
  } else if (keys.Space && !onGround && !dropActive && !planePhase && elapsed - lastJumpAt > 0.22 && elapsed - lastJumpAt < 0.72 && flipTimer <= 0) {
    flipTimer = 0.62; verticalSpeed = Math.max(verticalSpeed, 6.0); parkourFlash = 1;
    document.getElementById('parkourHint').textContent = '✦ MORTAL!';
    document.getElementById('parkourHint').style.opacity = '1';
    ensureAudio(); sfx('jump');
  }

  if (flipTimer > 0) {
    flipTimer = Math.max(0, flipTimer - dt);
    heroRig.root.rotation.x = (1 - flipTimer / 0.62) * Math.PI * 2;
  } else if (!ended) {
    heroRig.root.rotation.x = THREE.MathUtils.damp(heroRig.root.rotation.x, 0, 12, dt);
  }

  // --- AVIÃO LENTO E VISÍVEL + EJEÇÃO AUTOMÁTICA NO FINAL ---
  if (planePhase) {
    plane.visible = true;
    plane.position.x += 5.2 * dt; // Avião visível cruzando a ilha devagar
    plane.position.z += 1.4 * dt;
    player.position.set(plane.position.x, plane.position.y - 1.5, plane.position.z);
    player.rotation.y = Math.PI / 2;
    heroRig.root.visible = false;
    document.getElementById('dropHint').textContent = '✈️ NO AVIÃO — PRESSIONE [ESPAÇO] OU [PULAR] PARA SALTAR';

    // Se chegar no final da rota perto do gás sem pular, é expulso automaticamente
    if (plane.position.x >= zoneR - 6 || plane.position.x >= MAP_RADIUS - 18) {
      jumpFromPlane(true);
    }
  } else if (dropActive) {
    // Avião continua visível no céu
    plane.position.x += 5.2 * dt;
    plane.position.z += 1.4 * dt;
    if (plane.position.x > 260) plane.visible = false;

    dropTime += dt;
    player.position.y = Math.max(0, player.position.y - 4.8 * dt);
    heroRig.root.visible = !firstPerson;
    parachute.visible = true;
    parachute.position.set(player.position.x, player.position.y, player.position.z);
    parachute.rotation.y = player.rotation.y;
    if (player.position.y <= 0) {
      dropActive = false;
      parachute.visible = false;
      onGround = true;
      document.getElementById('dropHint').textContent = '';
    }
  } else {
    if (plane.visible) {
      plane.position.x += 5.2 * dt;
      if (plane.position.x > 260) plane.visible = false;
    }
    verticalSpeed = Math.max(-42, verticalSpeed - 24.5 * dt);
    player.position.y += verticalSpeed * dt;
    if (player.position.y <= 0) {
      const landingSpeed=Math.abs(verticalSpeed);
      player.position.y = 0; verticalSpeed = 0; onGround = true;
      if(landingSpeed>7){ landingImpact=Math.min(0.12,(landingSpeed-7)*0.008); }
    }
  }

  if (gelCooldown > 0) gelCooldown -= dt;
  for (let i = gelWalls.length - 1; i >= 0; i--) {
    gelWalls[i].life -= dt;
    if (gelWalls[i].life <= 0) { scene.remove(gelWalls[i].wall); gelWalls.splice(i, 1); }
  }

  // --- ANIMAÇÕES FLUIDAS DO PERSONAGEM ---
  animClock += dt * (running ? 14 : 8.5);
  const swing = moving ? Math.sin(animClock) * (running ? 0.92 : 0.5) : 0;
  const idleBreath = Math.sin(elapsed * 2.6) * 0.015;
  heroRig.root.position.y = (crouching ? -0.45 : 0) + (onGround && moving ? Math.abs(Math.sin(animClock * 2)) * 0.045 : idleBreath);
  heroRig.root.scale.y = THREE.MathUtils.damp(heroRig.root.scale.y, crouching ? 0.78 : 1, 14, dt);
  heroRig.torso.rotation.x = THREE.MathUtils.damp(heroRig.torso.rotation.x, running ? 0.14 : (crouching ? 0.22 : 0), 10, dt);
  heroRig.leftArm.rotation.x = THREE.MathUtils.damp(heroRig.leftArm.rotation.x, swing, 14, dt);
  heroRig.rightArm.rotation.x = THREE.MathUtils.damp(heroRig.rightArm.rotation.x, weapon ? -1.35 : -swing, 14, dt);
  heroRig.leftLeg.rotation.x = THREE.MathUtils.damp(heroRig.leftLeg.rotation.x, -swing, 14, dt);
  heroRig.rightLeg.rotation.x = THREE.MathUtils.damp(heroRig.rightLeg.rotation.x, swing, 14, dt);

  // Camada extra: respiração, olhar, inclinação ao correr e reação ao salto.
  const idleLook = moving ? 0 : Math.sin(elapsed * 0.8) * 0.10;
  heroRig.headGrp.rotation.y = THREE.MathUtils.damp(heroRig.headGrp.rotation.y, idleLook, 5, dt);
  heroRig.headGrp.rotation.x = THREE.MathUtils.damp(
    heroRig.headGrp.rotation.x, moving ? -0.035 : Math.sin(elapsed * 1.7) * 0.025, 5, dt
  );
  heroRig.torso.rotation.z = THREE.MathUtils.damp(
    heroRig.torso.rotation.z, moving ? -Math.cos(animClock) * (running ? 0.075 : 0.035) : 0, 9, dt
  );
  if (!moving && !weapon) {
    heroRig.leftArm.rotation.z = THREE.MathUtils.damp(heroRig.leftArm.rotation.z, Math.sin(elapsed * 1.4) * 0.035, 5, dt);
    heroRig.rightArm.rotation.z = THREE.MathUtils.damp(heroRig.rightArm.rotation.z, -Math.sin(elapsed * 1.4) * 0.035, 5, dt);
  }
  const airborne = !onGround && !dropActive;
  if (airborne) {
    heroRig.leftLeg.rotation.x = THREE.MathUtils.damp(heroRig.leftLeg.rotation.x, -0.48, 8, dt);
    heroRig.rightLeg.rotation.x = THREE.MathUtils.damp(heroRig.rightLeg.rotation.x, -0.48, 8, dt);
    heroRig.leftArm.rotation.x = THREE.MathUtils.damp(heroRig.leftArm.rotation.x, -0.75, 8, dt);
    heroRig.rightArm.rotation.x = THREE.MathUtils.damp(heroRig.rightArm.rotation.x, weapon ? -1.5 : -0.75, 8, dt);
  }

  // --- ANIMAÇÃO REALISTA DA ARMA EM 1ª PESSOA ---
  if (fpWeaponMesh && fpWeaponMesh.visible) {
    fpRecoilZ = THREE.MathUtils.damp(fpRecoilZ, 0, 16, dt);
    fpRecoilPitch = THREE.MathUtils.damp(fpRecoilPitch, 0, 14, dt);
    const swayX = moving ? Math.cos(animClock) * (running ? 0.022 : 0.01) : Math.sin(elapsed * 1.8) * 0.003;
    const swayY = moving ? Math.abs(Math.sin(animClock)) * (running ? 0.02 : 0.008) : Math.cos(elapsed * 2.2) * 0.003;
    const reloadTilt = reloadTimer > 0 ? Math.sin((1.4 - reloadTimer) / 1.4 * Math.PI) * 0.65 : 0;
    const sprintTilt = running ? -0.35 : 0;

    fpWeaponMesh.position.set(0.26 + swayX, -0.24 - swayY - reloadTilt * 0.15, -0.48 + fpRecoilZ);
    fpWeaponMesh.rotation.set(fpRecoilPitch - reloadTilt, sprintTilt, sprintTilt * 0.6);
  }

  // Detecção de Loot e Kits Médicos
  nearestLoot = null; nearestMedkit = null;
  let lootDist = 3.0;
  for (const item of loots) {
    item.group.rotation.y += dt * 0.9;
    const d = Math.hypot(player.position.x - item.group.position.x, player.position.z - item.group.position.z);
    if (d < lootDist) { lootDist = d; nearestLoot = item; }
  }
  let medDist = 3.0;
  for (const kit of medkits) {
    kit.rotation.y += dt * 0.65;
    const d = Math.hypot(player.position.x - kit.position.x, player.position.z - kit.position.z);
    if (d < medDist) { medDist = d; nearestMedkit = kit; }
  }
  const pickupBtn = document.getElementById('pickup');
  pickupBtn.style.display = (nearestLoot || nearestMedkit) ? 'block' : 'none';
  pickupBtn.textContent = nearestMedkit ? 'PEGAR KIT MÉDICO [E]' : `PEGAR ${nearestLoot ? nearestLoot.type.name.toUpperCase() : 'ARMA'} [E]`;

  // Câmera (Avião / 1ª Pessoa / 3ª Pessoa)
  if (planePhase) {
    const camPos = new THREE.Vector3(plane.position.x - 16, plane.position.y + 7, plane.position.z + 12);
    camera.position.lerp(camPos, 1 - Math.exp(-dt * 6));
    camera.lookAt(plane.position.x + 6, plane.position.y - 1, plane.position.z);
  } else if (firstPerson || aiming) {
    const eyeH = player.position.y + (crouching ? 1.15 : 1.68);
    const horizontalSpeed = Math.hypot(playerVelX, playerVelZ);
    const bobTarget = !aiming && onGround ? Math.min(1, horizontalSpeed / 7.5) : 0;
    fpBob = THREE.MathUtils.damp(fpBob, bobTarget, 6.5, dt);
    // Câmera sem deslocamento lateral ou inclinação acumulada: reduz tremedeira no celular.
    landingImpact = THREE.MathUtils.damp(landingImpact,0,10,dt);
    const bobY = Math.sin(animClock * (running ? 11 : 7.5)) * 0.009 * fpBob - landingImpact;
    camera.position.set(player.position.x, eyeH + bobY, player.position.z);
    camera.rotation.order = 'YXZ';
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
    if (fpWeaponRig) {
      fpWeaponRig.position.set(0.26 + Math.sin(animClock * 6) * 0.006 * fpBob, -0.24 - Math.abs(Math.sin(animClock * 7)) * 0.009 * fpBob, 0);
      fpWeaponRig.rotation.set(-Math.abs(Math.sin(animClock * 7)) * 0.009 * fpBob, 0, 0);
    }
  } else {
    const camDist = 6.8;
    const desired = new THREE.Vector3(player.position.x + Math.sin(yaw) * camDist, player.position.y + (crouching ? 2.55 : 3.35) + pitch * 3, player.position.z + Math.cos(yaw) * camDist);
    camera.position.lerp(desired, 1 - Math.exp(-dt * 9.5));
    const shoulderTarget = new THREE.Vector3(player.position.x - Math.cos(yaw) * 0.58, player.position.y + (crouching ? 1.0 : 1.42), player.position.z + Math.sin(yaw) * 0.58);
    camera.lookAt(shoulderTarget);
  }

  // --- ATUALIZAÇÃO DOS BOTS (QUEDA DE PARAQUEDAS + COMBATE) ---
  for (const b of bots) {
    if (b.hp <= 0) {
      if (b.deathAnim < Math.PI / 2) {
        b.deathAnim = Math.min(Math.PI / 2, b.deathAnim + dt * 4.5);
        b.g.rotation.x = b.deathAnim;
        b.g.position.y = 0.18;
      }
      continue;
    }

    if (b.inPlane) {
      b.g.position.set(plane.position.x - 2, plane.position.y - 1, plane.position.z);
      b.g.visible = false;
      if (elapsed >= b.jumpingAt || !planePhase) {
        b.inPlane = false;
        b.parachuting = true;
        b.g.visible = true;
        b.chute.visible = true;
      }
      continue;
    }

    if (b.parachuting) {
      b.g.position.y = Math.max(0, b.g.position.y - 4.4 * dt);
      const tx = b.targetLandX - b.g.position.x, tz = b.targetLandZ - b.g.position.z, td = Math.hypot(tx, tz) || 1;
      b.g.position.x += (tx / td) * 3.5 * dt;
      b.g.position.z += (tz / td) * 3.5 * dt;
      if (b.g.position.y <= 0) {
        b.parachuting = false;
        b.chute.visible = false;
      }
      continue;
    }

    // IA de combate: cada bot escolhe o adversário vivo mais próximo (jogador ou outro bot).
    const botPos = b.g.position;
    let target = { kind: 'player', obj: player, x: player.position.x, z: player.position.z, hp: health };
    let dx = target.x - botPos.x, dz = target.z - botPos.z;
    let bestDist = Math.hypot(dx, dz);
    for (const other of bots) {
      if (other === b || other.hp <= 0 || other.inPlane || other.parachuting) continue;
      const ox = other.g.position.x - botPos.x, oz = other.g.position.z - botPos.z;
      const od = Math.hypot(ox, oz);
      if (od < bestDist) {
        bestDist = od;
        target = { kind: 'bot', obj: other, x: other.g.position.x, z: other.g.position.z, hp: other.hp };
        dx = ox; dz = oz;
      }
    }
    const d = Math.max(0.001, bestDist);
    const nx = dx / d, nz = dz / d;
    const lowHealth = b.hp <= 32;
    const botRadius = Math.hypot(botPos.x, botPos.z);
    const gasEdge = zoneR - botRadius;
    // Os bots percebem a bord da zona e fogem antes de serem eliminados pelo gás.
    const gasPanic = !planePhase && gasEdge < 9;
    const preferredRange = lowHealth ? 24 : 13;
    b.strafeTimer -= dt;
    if (b.strafeTimer <= 0) {
      b.strafeDir = Math.random() < 0.5 ? -1 : 1;
      b.strafeTimer = 0.7 + Math.random() * 1.5;
    }

    let moveX = 0, moveZ = 0;
    if (gasPanic) {
      // Prioridade máxima: correr para o centro seguro, sem parar para trocar tiros.
      const safeLen = botRadius || 1;
      moveX = -botPos.x / safeLen;
      moveZ = -botPos.z / safeLen;
    } else if (lowHealth && d < 42) {
      moveX = -nx * 1.0; moveZ = -nz * 1.0;
    } else if (d > preferredRange + 3) {
      moveX = nx * 0.82; moveZ = nz * 0.82;
    } else if (d < preferredRange - 4) {
      moveX = -nx * 0.55; moveZ = -nz * 0.55;
    }
    if (!gasPanic && d < 48) {
      moveX += -nz * b.strafeDir * 0.48;
      moveZ += nx * b.strafeDir * 0.48;
    }
    // Navegação física: separação entre bots e desvio suave de árvores/edifícios.
    for(const other of bots){
      if(other===b||other.hp<=0||other.inPlane||other.parachuting)continue;
      const sx=botPos.x-other.g.position.x, sz=botPos.z-other.g.position.z, sd=Math.hypot(sx,sz);
      if(sd>0.001&&sd<2.8){const push=(2.8-sd)/2.8;moveX+=(sx/sd)*push*1.25;moveZ+=(sz/sd)*push*1.25;}
    }
    for(const obstacle of solidTrees){
      const sx=botPos.x-obstacle.x, sz=botPos.z-obstacle.z, sd=Math.hypot(sx,sz), safe=obstacle.r+1.35;
      if(sd>0.001&&sd<safe){const push=(safe-sd)/safe;moveX+=(sx/sd)*push*1.8;moveZ+=(sz/sd)*push*1.8;}
    }
    for(const obstacle of solidBuildings){
      const sx=botPos.x-obstacle.x, sz=botPos.z-obstacle.z;
      if(Math.abs(sx)<obstacle.hx+1.5&&Math.abs(sz)<obstacle.hz+1.5){
        const px=(obstacle.hx+1.5-Math.abs(sx))/(obstacle.hx+1.5);
        const pz=(obstacle.hz+1.5-Math.abs(sz))/(obstacle.hz+1.5);
        if(px<pz)moveX+=Math.sign(sx||1)*px*1.5;else moveZ+=Math.sign(sz||1)*pz*1.5;
      }
    }
    const moveLen = Math.hypot(moveX, moveZ) || 1;
    const speed = gasPanic ? 6.0 : (lowHealth ? 3.25 : 2.7);
    const desiredBotX=(moveX/moveLen)*Math.min(1,Math.hypot(moveX,moveZ))*speed;
    const desiredBotZ=(moveZ/moveLen)*Math.min(1,Math.hypot(moveX,moveZ))*speed;
    b.velX=THREE.MathUtils.damp(b.velX||0,desiredBotX,gasPanic?7:4.5,dt);
    b.velZ=THREE.MathUtils.damp(b.velZ||0,desiredBotZ,gasPanic?7:4.5,dt);
    const nextBot=resolvePlayerCollision(botPos.x+b.velX*dt,botPos.z+b.velZ*dt);
    botPos.x=THREE.MathUtils.clamp(nextBot.x,-MAP_RADIUS+3,MAP_RADIUS-3);
    botPos.z=THREE.MathUtils.clamp(nextBot.z,-MAP_RADIUS+3,MAP_RADIUS-3);
    b.g.rotation.y = gasPanic ? Math.atan2(botPos.x, botPos.z) : Math.atan2(-dx, -dz);

    // Animação de corrida e postura de combate.
    b.phase += dt * (Math.hypot(moveX, moveZ) > 0.12 ? 8 : 2.2);
    const runSwing = Math.sin(b.phase) * (Math.hypot(moveX, moveZ) > 0.12 ? 0.62 : 0.08);
    b.rig.leftLeg.rotation.x = THREE.MathUtils.damp(b.rig.leftLeg.rotation.x, runSwing, 8, dt);
    b.rig.rightLeg.rotation.x = THREE.MathUtils.damp(b.rig.rightLeg.rotation.x, -runSwing, 8, dt);
    b.rig.leftArm.rotation.x = THREE.MathUtils.damp(b.rig.leftArm.rotation.x, -0.18 + runSwing * 0.25, 7, dt);
    b.rig.rightArm.rotation.x = THREE.MathUtils.damp(b.rig.rightArm.rotation.x, -1.18, 7, dt);
    b.rig.torso.rotation.z = THREE.MathUtils.damp(b.rig.torso.rotation.z, lowHealth ? -0.08 : 0, 5, dt);

    // Disparos entre bots e contra o jogador, com dano de jogo e traçante visual.
    b.shot -= dt;
    if (!gasPanic && d < 40 && b.shot <= 0 && !planePhase && !dropActive) {
      b.shot = 0.95 + Math.random() * 1.05;
      const startPos = new THREE.Vector3(botPos.x, botPos.y + 1.35, botPos.z);
      const endPos = new THREE.Vector3(target.x, (target.kind === 'player' ? player.position.y : target.obj.g.position.y) + 1.05, target.z);
      const accuracy = lowHealth ? 0.28 : 0.48;
      if (Math.random() < accuracy) {
        spawnTracer(startPos, endPos, target.kind === 'player' ? 0xff6655 : 0xffb84d);
        const damage = 4 + Math.random() * 4;
        if (target.kind === 'player') {
          health = Math.max(0, health - damage);
          document.getElementById('healthFill').style.width = health + '%';
          document.getElementById('hpText').textContent = Math.floor(health) + ' / 100';
          const df = document.getElementById('damageFlash');
          df.style.opacity = '1';
          setTimeout(() => { df.style.opacity = '0'; }, 120);
          if (health <= 0) finish(false);
        } else if (target.obj.hp > 0) {
          target.obj.hp -= damage;
          if (target.obj.hp <= 0) {
            target.obj.hp = 0;
            b.kills = (b.kills || 0) + 1;

            document.getElementById('bots').textContent = bots.filter(other => other.hp > 0).length;
            checkWin();
          }
        }
      }
    }
  }

  // Encolhimento da Zona Segura e Dano do Gás: 15 HP/s para jogador e bots
  zoneR = Math.max(12, 138 - Math.min(126, elapsed * (126 / 210)));
  zone.scale.set(zoneR, zoneR, 1);
  gasWall.scale.set(zoneR, 1, zoneR);

  let botGasEliminated = false;
  if (!planePhase) {
    for (const b of bots) {
      if (b.hp <= 0 || b.inPlane || b.parachuting) continue;
      if (Math.hypot(b.g.position.x, b.g.position.z) > zoneR) {
        b.hp = Math.max(0, b.hp - 15 * dt);
        if (b.hp <= 0) {
          b.deathAnim = Math.max(b.deathAnim || 0, 0.001);
          botGasEliminated = true;
        }
      }
    }
    if (botGasEliminated) {
      document.getElementById('bots').textContent = bots.filter(b => b.hp > 0).length;
      checkWin();
    }
  }

  if (parkourFlash > 0) { parkourFlash -= dt; if (parkourFlash <= 0) document.getElementById('parkourHint').style.opacity = '0'; }
  const outsideGas = !planePhase && Math.hypot(player.position.x, player.position.z) > zoneR;
  document.getElementById('gasWarning').style.display = outsideGas ? 'block' : 'none';
  if (outsideGas) {
    health = Math.max(0, health - 15 * dt);
    document.getElementById('healthFill').style.width = health + '%';
    document.getElementById('hpText').textContent = Math.floor(health) + ' / 100';
    if (health <= 0) finish(false);
  }
  if (shooting) shoot();

}

let last = performance.now();
function drawMini() {
  const c = document.getElementById('mini'), ctx = c.getContext('2d'), cx = 92, cy = 92, scale = 0.72;
  ctx.clearRect(0, 0, 184, 184);
  ctx.fillStyle = '#0f303a'; ctx.beginPath(); ctx.arc(cx, cy, 88, 0, Math.PI * 2); ctx.fill();
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, 86, 0, Math.PI * 2); ctx.clip();
  // O mapa gira junto com a direção da câmera; o jogador permanece apontado para cima.
  ctx.translate(cx, cy);
  ctx.rotate(yaw);
  ctx.fillStyle = '#4c7c3e'; ctx.beginPath(); ctx.arc(-player.position.x * scale, -player.position.z * scale, MAP_RADIUS * scale, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(-player.position.x * scale, -player.position.z * scale, zoneR * scale, 0, Math.PI * 2); ctx.stroke();
  // Desenha o cenário inteiro no radar: casas, ruínas, árvores e costa acompanham a rotação.
  for (const b of solidBuildings) {
    const bx = (b.x - player.position.x) * scale, bz = (b.z - player.position.z) * scale;
    ctx.fillStyle = '#d6b98a'; ctx.fillRect(bx - 3.5, bz - 3.5, 7, 7);
    ctx.strokeStyle = '#5b4630'; ctx.lineWidth = 0.8; ctx.strokeRect(bx - 3.5, bz - 3.5, 7, 7);
  }
  for (const t of solidTrees) {
    const tx = (t.x - player.position.x) * scale, tz = (t.z - player.position.z) * scale;
    ctx.fillStyle = '#1d5c37'; ctx.beginPath(); ctx.arc(tx, tz, 1.9, 0, Math.PI * 2); ctx.fill();
  }
  // Linha da costa fixa no mapa, para orientar a posição da ilha.
  ctx.strokeStyle = 'rgba(190,235,232,.65)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(-player.position.x * scale, -player.position.z * scale, (MAP_RADIUS + 3) * scale, 0, Math.PI * 2); ctx.stroke();
  for (const l of loots) {
    ctx.fillStyle = '#facc15';
    ctx.fillRect((l.group.position.x - player.position.x) * scale - 2, (l.group.position.z - player.position.z) * scale - 2, 4, 4);
  }
  for (const b of bots) {
    if (b.hp <= 0 || b.inPlane) continue;
    ctx.fillStyle = '#ef4444';
    ctx.beginPath(); ctx.arc((b.g.position.x - player.position.x) * scale, (b.g.position.z - player.position.z) * scale, 3.5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  // Seta fixa representa a direção para a qual o jogador está olhando.
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(cx, cy - 8); ctx.lineTo(cx - 5, cy + 5); ctx.lineTo(cx + 5, cy + 5); ctx.closePath(); ctx.fill();
}

function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.04, (now - last) / 1000);
  last = now;
  update(dt);
  if (playing) drawMini();
  else updateLobbyPreview(dt);
  renderer.render(scene, camera);
}
requestAnimationFrame(loop);

// --- INICIAR PARTIDA ---
document.getElementById('play').onclick = () => {
  applyMapTheme(document.getElementById('mapChoice').value);
  ensureAudio();
  applySkin(Number(document.getElementById('skinChoice').value));
  setCrouch(false);
  document.getElementById('start').style.display = 'none';
  playing = true;
  kills=0; health=100; stamina=100; sprintTouch=false; document.getElementById('kills').textContent='0';

  planePhase = true;
  dropActive = false;
  plane.visible = true;
  plane.position.set(-115, 42, -25);
  parachute.visible = false;
  setAim(false);
  spawnAllBotsInPlane();
  updateMedkitHud();
  document.getElementById('jump').style.display = 'block';
  updateWeaponHud();
  renderInventory();
  tryRequestPointerLock();
};

function refreshLobbySkin() {
  const i = Number(document.getElementById('skinChoice').value);
  const cfg = skinConfigs[i];
  document.getElementById('skinName').textContent = cfg.label.toUpperCase();
  document.getElementById('skinTag').textContent=cfg.desc;
  if(lobbyScene && lobbyHero){lobbyScene.remove(lobbyHero.root);lobbyHero=buildArticulatedCharacter(cfg,false);lobbyScene.add(lobbyHero.root);attachHumanModel(lobbyHero.root,lobbyGlbMixers,true);}
}
document.getElementById('skinChoice').onchange = refreshLobbySkin;
document.getElementById('skinPrev').onclick = () => { const e = document.getElementById('skinChoice'); e.value = (Number(e.value) + skinConfigs.length - 1) % skinConfigs.length; refreshLobbySkin(); };
document.getElementById('skinNext').onclick = () => { const e = document.getElementById('skinChoice'); e.value = (Number(e.value) + 1) % skinConfigs.length; refreshLobbySkin(); };
refreshLobbySkin();
initLobbyPreview();

document.getElementById('restart').onclick = () => { document.exitPointerLock?.(); location.reload(); };
document.getElementById('revive').onclick = () => {
  if (reviveUsed) return;
  reviveUsed = true; ended = false; health = 100; player.position.set(0, 0, 0); verticalSpeed = 0; onGround = true;
  document.getElementById('healthFill').style.width = '100%';
  document.getElementById('hpText').textContent = '100 / 100';
  document.getElementById('message').textContent = '';
  document.getElementById('revive').style.display = 'none';
  document.getElementById('restart').style.display = 'none';
  tryRequestPointerLock();
};
document.getElementById('quickToggle').addEventListener('click', () => document.getElementById('quickPanel').classList.toggle('open'));
document.getElementById('resumeBtn').addEventListener('click', () => document.getElementById('quickPanel').classList.remove('open'));
document.getElementById('fullScreenBtn').addEventListener('click', async () => { try { if (!document.fullscreenElement) await document.documentElement.requestFullscreen(); else await document.exitFullscreen(); } catch (_) {} });
document.getElementById('hudBtn').addEventListener('click', () => {
  const hud = document.getElementById('hud'); const hidden = hud.dataset.hidden !== '1'; hud.dataset.hidden = hidden ? '1' : '0';
  for (const id of ['top', 'mini', 'help', 'crosshair', 'inventory']) document.getElementById(id).style.visibility = hidden ? 'hidden' : 'visible';
  document.getElementById('hudBtn').textContent = hidden ? 'MOSTRAR HUD' : 'OCULTAR HUD';
});
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
