// ================================================================
//  WORK VOLT — js/adapters/firebase.js
//  Firebase / Firestore adapter stub
//  Fill in the implementation when you're ready to support Firebase
// ================================================================

const FIREBASE_SDK_APP  = 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
const FIREBASE_SDK_AUTH = 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
const FIREBASE_SDK_DB   = 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

export class FirebaseAdapter extends BaseAdapter {

  constructor() {
    super();
    this._app  = null;
    this._auth = null;
    this._db   = null;
  }

  async _loadSDK() {
    if (window._firebaseLoaded) return;
    // Firebase uses ES modules — load dynamically
    const [{ initializeApp }, { getAuth }, { getFirestore }] = await Promise.all([
      import(FIREBASE_SDK_APP),
      import(FIREBASE_SDK_AUTH),
      import(FIREBASE_SDK_DB),
    ]);
    window._firebaseInitApp  = initializeApp;
    window._firebaseGetAuth  = getAuth;
    window._firebaseGetDB    = getFirestore;
    window._firebaseLoaded   = true;
  }

  async init(credentials) {
    const { apiKey, projectId, appId } = credentials;
    if (!apiKey || !projectId || !appId) throw new Error('Firebase API Key, Project ID and App ID are required.');

    await this._loadSDK();

    this._app  = window._firebaseInitApp({ apiKey, authDomain: projectId + '.firebaseapp.com', projectId, appId });
    this._auth = window._firebaseGetAuth(this._app);
    this._db   = window._firebaseGetDB(this._app);
    return true;
  }

  async login(email, password) {
    const { signInWithEmailAndPassword } = await import(FIREBASE_SDK_AUTH);
    const cred    = await signInWithEmailAndPassword(this._auth, email, password);
    const user    = cred.user;

    // Fetch profile from Firestore users collection
    const { doc, getDoc } = await import(FIREBASE_SDK_DB);
    const snap = await getDoc(doc(this._db, 'users', user.uid));
    if (!snap.exists()) throw new Error('User profile not found.');
    const profile = { id: user.uid, ...snap.data() };
    if (!profile.active) throw new Error('Account deactivated.');

    return { user: profile, session: await user.getIdToken() };
  }

  async logout() {
    await this._auth.signOut();
  }

  async getSession() {
    return this._auth.currentUser ? await this._auth.currentUser.getIdToken() : null;
  }

  async getUser() {
    const user = this._auth.currentUser;
    if (!user) return null;
    const { doc, getDoc } = await import(FIREBASE_SDK_DB);
    const snap = await getDoc(doc(this._db, 'users', user.uid));
    return snap.exists() ? { id: user.uid, ...snap.data() } : null;
  }

  async changePassword(newPassword) {
    const { updatePassword } = await import(FIREBASE_SDK_AUTH);
    await updatePassword(this._auth.currentUser, newPassword);
  }

  async sendPasswordReset(email) {
    const { sendPasswordResetEmail } = await import(FIREBASE_SDK_AUTH);
    await sendPasswordResetEmail(this._auth, email);
  }

  // ── Firestore CRUD ───────────────────────────────────────────────
  async list(table, filters = {}, options = {}) {
    const { collection, query, where, orderBy, limit, getDocs } = await import(FIREBASE_SDK_DB);
    let q = collection(this._db, table);
    const constraints = [];
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') constraints.push(where(k, '==', v));
    });
    if (options.order) constraints.push(orderBy(options.order, options.asc ? 'asc' : 'desc'));
    if (options.limit) constraints.push(limit(options.limit));
    const snap = await getDocs(constraints.length ? query(q, ...constraints) : q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  async get(table, id) {
    const { doc, getDoc } = await import(FIREBASE_SDK_DB);
    const snap = await getDoc(doc(this._db, table, id));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  }

  async create(table, row) {
    const { collection, addDoc } = await import(FIREBASE_SDK_DB);
    const now = new Date().toISOString();
    const ref = await addDoc(collection(this._db, table), { ...row, created_at: now, updated_at: now });
    return { id: ref.id, ...row };
  }

  async update(table, id, patch) {
    const { doc, updateDoc } = await import(FIREBASE_SDK_DB);
    await updateDoc(doc(this._db, table, id), { ...patch, updated_at: new Date().toISOString() });
    return { id, ...patch };
  }

  async delete(table, id) {
    const { doc, deleteDoc } = await import(FIREBASE_SDK_DB);
    await deleteDoc(doc(this._db, table, id));
    return true;
  }

  // ── Config (uses a 'config' collection) ─────────────────────────
  async configGet(key) {
    const { doc, getDoc } = await import(FIREBASE_SDK_DB);
    const snap = await getDoc(doc(this._db, 'config', key));
    return snap.exists() ? snap.data().value : null;
  }

  async configSet(key, value) {
    const { doc, setDoc } = await import(FIREBASE_SDK_DB);
    await setDoc(doc(this._db, 'config', key), { value, updated_at: new Date().toISOString() });
  }

  async configGetAll() {
    const { collection, getDocs } = await import(FIREBASE_SDK_DB);
    const snap = await getDocs(collection(this._db, 'config'));
    return Object.fromEntries(snap.docs.map(d => [d.id, d.data().value]));
  }
}
