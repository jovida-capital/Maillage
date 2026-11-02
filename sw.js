// Service worker : rend l'application utilisable hors ligne et installable.
// Changez CACHE_VERSION pour forcer le renouvellement du cache après une mise à jour.
const CACHE_VERSION = 'maillage-v1';

// Le strict nécessaire pour que l'application démarre sans réseau.
const COQUILLE = [
  './',
  './index.html',
  './manifest.webmanifest',
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

self.addEventListener('fetch', (e)=>{
  const req = e.request;
  if(req.method !== 'GET') return;

  const url = new URL(req.url);

  // Jamais de cache pour Supabase : les données doivent être fraîches,
  // et une réponse rejouée fausserait la détection de conflit.
  if(url.origin !== self.location.origin && !/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) return;

  // La page elle-même : réseau d'abord, pour recevoir vos mises à jour,
  // avec repli sur le cache quand il n'y a pas de réseau.
  if(req.mode === 'navigate' || url.pathname.endsWith('/index.html')){
    e.respondWith(
      fetch(req)
        .then(rep => {
          const copie = rep.clone();
          caches.open(CACHE_VERSION).then(c => c.put('./index.html', copie));
          return rep;
        })
        .catch(() => caches.match('./index.html').then(r => r || caches.match('./')))
    );
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
