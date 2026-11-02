// Service worker : rend l'application utilisable hors ligne et installable.
// Changez CACHE_VERSION pour forcer le renouvellement du cache après une mise à jour.
const CACHE_VERSION = 'maillage-v2';

// Le strict nécessaire pour que l'application démarre sans réseau.
const COQUILLE = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png'
];

self.addEventListener('install', (e)=>{
  e.waitUntil(
    caches.open(CACHE_VERSION)
      // addAll échoue en bloc si un seul fichier manque : on tolère les absents.
      .then(c => Promise.allSettled(COQUILLE.map(u => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e)=>{
  e.waitUntil(
    caches.keys()
      .then(noms => Promise.all(noms.filter(n => n !== CACHE_VERSION).map(n => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

// Réseau d'abord, cache en secours : pour ce qui doit refléter vos mises à jour.
// cache:'no-cache' oblige à revalider auprès du serveur : GitHub Pages autorise
// sinon le navigateur à resservir une copie vieille de 10 minutes.
function reseauDabord(req, cleCache){
  return fetch(new Request(req.url, { cache: 'no-cache', credentials: 'same-origin' }))
    .then(rep => {
      if(rep && rep.ok){
        const copie = rep.clone();
        caches.open(CACHE_VERSION).then(c => c.put(cleCache || req, copie));
      }
      return rep;
    })
    .catch(() => caches.match(cleCache || req).then(r => r || caches.match('./')));
}

self.addEventListener('fetch', (e)=>{
  const req = e.request;
  if(req.method !== 'GET') return;

  const url = new URL(req.url);

  // Jamais de cache pour Supabase : les données doivent être fraîches,
  // et une réponse rejouée fausserait la détection de conflit.
  if(url.origin !== self.location.origin && !/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) return;

  // La page : toute navigation, quels que soient les paramètres d'adresse.
  if(req.mode === 'navigate' || url.pathname.endsWith('/index.html')){
    e.respondWith(reseauDabord(req, './index.html'));
    return;
  }

  // Le manifeste décide de l'installation : servi en cache, il resterait figé
  // et Android ne verrait jamais ses changements.
  if(url.pathname.endsWith('.webmanifest')){
    e.respondWith(reseauDabord(req));
    return;
  }

  // Le reste (icônes, polices) : cache d'abord, c'est figé.
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(rep => {
      if(rep && rep.status === 200){
        const copie = rep.clone();
        caches.open(CACHE_VERSION).then(c => c.put(req, copie));
      }
      return rep;
    }).catch(() => new Response('', { status: 504, statusText: 'Hors ligne' })))
  );
});
