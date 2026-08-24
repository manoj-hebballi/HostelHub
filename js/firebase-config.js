/* ============================================
   HOSTELHUB — Firebase Configuration
   ============================================ */

const firebaseConfig = {
  apiKey: "AIzaSyC5zbikT_cO9j4_hy95e_SsGjKxVwHBLz8",
  authDomain: "paper-ai-6ef75.firebaseapp.com",
  projectId: "paper-ai-6ef75",
  storageBucket: "paper-ai-6ef75.firebasestorage.app",
  messagingSenderId: "1036459570669",
  appId: "1:1036459570669:web:ff25fed8e4b828de75e3e4",
  measurementId: "G-0LWD5DD78J"
};

/* ============================================
   Firebase Initialization
   ============================================ */

let app = null;
let auth = null;
let db = null;
let storage = null;

/*
 * Wait until Firebase SDK is available.
 * This prevents firebase-config.js from running
 * before firebase-app/auth/firestore scripts load.
 */

(function initializeHostelHubFirebase() {

  function initFirebase() {

    if (typeof firebase === "undefined") {
      console.error(
        "HostelHub: Firebase SDK is not loaded. " +
        "Check firebase SDK <script> URLs and internet connection."
      );
      return false;
    }

    if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
      console.error("HostelHub: Firebase configuration is missing.");
      return false;
    }

    try {

      /* --------------------------------------------
         Initialize Firebase App
         -------------------------------------------- */

      if (!firebase.apps || firebase.apps.length === 0) {
        app = firebase.initializeApp(firebaseConfig);
      } else {
        app = firebase.app();
      }

      /* --------------------------------------------
         Firebase Authentication
         -------------------------------------------- */

      if (typeof firebase.auth === "function") {
        auth = firebase.auth();
      } else {
        console.error(
          "HostelHub: Firebase Auth SDK is not loaded."
        );
      }

      /* --------------------------------------------
         Cloud Firestore is initialized lazily only
         after an authenticated user exists. Initializing
         Firestore before sign-in triggers permission-denied
         listens and noisy network aborts.
         -------------------------------------------- */

      if (typeof firebase.firestore !== "function") {
        console.error(
         "HostelHub: Firebase Firestore SDK is not loaded."
        );
      }

      /* --------------------------------------------
         Firebase Storage
         -------------------------------------------- */

      if (typeof firebase.storage === "function") {
        storage = firebase.storage();
      }

      /* --------------------------------------------
         Final verification
         -------------------------------------------- */

      if (app && auth) {

        console.log(
          "HostelHub: Firebase initialized successfully."
        );

        console.log(
          "HostelHub: Firebase Project:",
          firebaseConfig.projectId
        );

        console.log(
          "HostelHub: Firebase Auth ready."
        );

        if (typeof firebase.auth === "function") {
          firebase.auth().onAuthStateChanged((user) => {
            if (user && typeof firebase.firestore === "function") {
              if (!db) {
                db = firebase.firestore();
              }
            } else if (!user) {
              db = null;
            }
          });
        }

        return true;

      } else {

        console.error(
          "HostelHub: Firebase initialization incomplete.",
          {
            app: !!app,
            auth: !!auth,
            db: !!db,
            storage: !!storage
          }
        );

        return false;
      }

    } catch (error) {

      console.error(
        "HostelHub: Firebase initialization failed:",
        error
      );

      return false;
    }
  }

  /*
   * Firebase SDK should normally already be loaded
   * before this file executes.
   */

  if (typeof firebase !== "undefined") {

    initFirebase();

  } else {

    /*
     * Give the SDK a short amount of time to load.
     * This helps when script loading order is slightly delayed.
     */

    let attempts = 0;
    const maxAttempts = 50;

    const waitForFirebase = setInterval(function () {

      attempts++;

      if (typeof firebase !== "undefined") {

        clearInterval(waitForFirebase);
        initFirebase();

      } else if (attempts >= maxAttempts) {

        clearInterval(waitForFirebase);

        console.error(
          "HostelHub: Firebase SDK could not be loaded after waiting."
        );

      }

    }, 100);

  }

})();

/* ============================================
   Global Firebase Access Helpers
   ============================================ */

function getFirebaseApp() {

  if (app) return app;

  if (
    typeof firebase !== "undefined" &&
    firebase.apps &&
    firebase.apps.length > 0
  ) {
    app = firebase.app();
    return app;
  }

  throw new Error("HostelHub: Firebase App is not initialized.");
}


function getFirebaseAuth() {

  if (auth) return auth;

  if (
    typeof firebase !== "undefined" &&
    typeof firebase.auth === "function"
  ) {
    auth = firebase.auth();
    return auth;
  }

  throw new Error("HostelHub: Firebase Auth is not configured.");
}


function getFirebaseDb() {

  if (db) return db;

  if (
    typeof firebase !== "undefined" &&
    typeof firebase.firestore === "function"
  ) {
    db = firebase.firestore();
    return db;
  }

  throw new Error("HostelHub: Firestore is not configured.");
}


/* ============================================
   Global Compatibility
   ============================================ */

window.hostelHubFirebase = {
  app: function () {
    return getFirebaseApp();
  },

  auth: function () {
    return getFirebaseAuth();
  },

  db: function () {
    return getFirebaseDb();
  },

  storage: function () {
    if (storage) return storage;

    if (
      typeof firebase !== "undefined" &&
      typeof firebase.storage === "function"
    ) {
      storage = firebase.storage();
      return storage;
    }

    return null;
  }
};


/* ============================================
   Debug Information
   ============================================ */

window.addEventListener("load", function () {

  setTimeout(function () {

    console.log(
      "========== HOSTELHUB FIREBASE STATUS =========="
    );

    console.log(
      "Firebase SDK:",
      typeof firebase !== "undefined"
        ? "LOADED"
        : "NOT LOADED"
    );

    console.log(
      "Firebase App:",
      app ? "READY" : "NOT READY"
    );

    console.log(
      "Firebase Auth:",
      auth ? "READY" : "NOT READY"
    );

    console.log(
      "Firestore:",
      db ? "READY" : "NOT READY"
    );

    console.log(
      "Firebase Project:",
      firebaseConfig.projectId
    );

    console.log(
      "==============================================="
    );

  }, 500);

});