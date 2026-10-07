(function () {
    let supabaseClient = null;
    let currentUser = null;
    let saveTimer = null;
    let syncInProgress = false;
    let suppressCloudSync = false;

    const META_KEY = 'monocheck_local_updated_at';

    function configured() {
        return !!(window.MONOCHECK_SUPABASE_URL && window.MONOCHECK_SUPABASE_ANON_KEY && window.supabase);
    }

    function setStatus(text, state = 'idle') {
        const textEl = document.getElementById('sync-status-text');
        const dot = document.getElementById('sync-status-dot');
        if (textEl) textEl.textContent = text;
        if (dot) {
            dot.className = 'w-2 h-2 rounded-full ' + (state === 'online' ? 'bg-emerald-500' : state === 'syncing' ? 'bg-amber-400' : state === 'error' ? 'bg-rose-500' : 'bg-slate-300');
        }
    }

    function showMessage(text, type = 'info') {
        const el = document.getElementById('sync-message');
        if (!el) return;
        el.textContent = text;
        el.className = 'text-xs rounded-2xl px-4 py-3 ' + (type === 'error' ? 'bg-rose-50 text-rose-700' : type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600');
    }

    function updateAccountUI() {
        const login = document.getElementById('sync-login-area');
        const account = document.getElementById('sync-account-area');
        const email = document.getElementById('sync-user-email');
        if (currentUser) {
            login?.classList.add('hidden');
            account?.classList.remove('hidden');
            if (email) email.textContent = currentUser.email || 'ログイン中';
        } else {
            login?.classList.remove('hidden');
            account?.classList.add('hidden');
        }
    }

    window.openSyncModal = function () {
        const modal = document.getElementById('sync-modal');
        if (!modal) return;
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        updateAccountUI();
        if (!configured()) {
            setStatus('クラウド同期の設定がまだありません');
            showMessage('Supabaseの設定を入れると、PCとスマホの同期が使えます。', 'info');
        } else if (currentUser) {
            setStatus('同期アカウントに接続済み', 'online');
        } else {
            setStatus('ログインしてください');
        }
    };

    window.closeSyncModal = function () {
        const modal = document.getElementById('sync-modal');
        if (!modal) return;
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    };

    function startSyncAfterAuthChange() {
        // SupabaseのonAuthStateChangeコールバック内でawaitして別のSupabase通信を
        // 行うとAuthロックと競合することがあるため、イベント処理の外へ逃がす。
        setTimeout(() => {
            if (currentUser) syncNow();
        }, 0);
    }

    window.initCloudSync = async function () {
        if (!configured()) {
            setStatus('端末内保存モード');
            return;
        }

        try {
            supabaseClient = window.supabase.createClient(window.MONOCHECK_SUPABASE_URL, window.MONOCHECK_SUPABASE_ANON_KEY);
            const { data, error } = await supabaseClient.auth.getSession();
            if (error) throw error;
            currentUser = data?.session?.user || null;
            updateAccountUI();

            if (currentUser) {
                setStatus('同期中…', 'syncing');
                await syncNow();
            } else {
                setStatus('未ログイン');
            }

            supabaseClient.auth.onAuthStateChange((_event, session) => {
                currentUser = session?.user || null;
                updateAccountUI();
                if (currentUser) {
                    setStatus('同期中…', 'syncing');
                    startSyncAfterAuthChange();
                } else {
                    setStatus('未ログイン');
                }
            });
        } catch (e) {
            console.error('Cloud auth init error:', e);
            setStatus('同期設定エラー', 'error');
            showMessage(e?.message || 'Supabaseへの接続に失敗しました。', 'error');
        }
    };

    window.syncSignUp = async function () {
        if (!configured()) return showMessage('先にsupabase-config.jsを設定してください。', 'error');
        if (!supabaseClient) return showMessage('同期機能を初期化しています。少し待ってからもう一度お試しください。', 'error');
        const email = document.getElementById('sync-email')?.value.trim();
        const password = document.getElementById('sync-password')?.value;
        if (!email || !password) return showMessage('メールアドレスとパスワードを入力してください。', 'error');
        if (password.length < 6) return showMessage('パスワードは6文字以上にしてください。', 'error');
        try {
            const { error } = await supabaseClient.auth.signUp({ email, password });
            if (error) throw error;
            showMessage('登録しました。確認メールが届く設定の場合は、メール確認後にログインしてください。', 'success');
        } catch (e) {
            console.error('Sign up error:', e);
            showMessage(e?.message || '新規登録に失敗しました。', 'error');
        }
    };

    window.syncSignIn = async function () {
        if (!configured()) return showMessage('先にsupabase-config.jsを設定してください。', 'error');
        if (!supabaseClient) return showMessage('同期機能を初期化しています。少し待ってからもう一度お試しください。', 'error');
        const email = document.getElementById('sync-email')?.value.trim();
        const password = document.getElementById('sync-password')?.value;
        if (!email || !password) return showMessage('メールアドレスとパスワードを入力してください。', 'error');
        try {
            const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
            if (error) throw error;
            showMessage('ログインしました。データを同期しています。', 'success');
        } catch (e) {
            console.error('Sign in error:', e);
            showMessage(e?.message || 'ログインに失敗しました。', 'error');
        }
    };

    window.syncSignOut = async function () {
        if (!supabaseClient) return;
        try {
            const { error } = await supabaseClient.auth.signOut();
            if (error) throw error;
            currentUser = null;
            updateAccountUI();
            setStatus('未ログイン');
            showMessage('ログアウトしました。端末内のデータは残ります。', 'info');
        } catch (e) {
            console.error('Sign out error:', e);
            showMessage(e?.message || 'ログアウトに失敗しました。', 'error');
        }
    };

    window.queueCloudSync = function () {
        if (suppressCloudSync || !currentUser || !supabaseClient) return;
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => syncNow(), 900);
    };

    function replaceLocalDataFromRemote(remoteData, remoteUpdated) {
        suppressCloudSync = true;
        try {
            appData.items = Array.isArray(remoteData?.items) ? remoteData.items : [];
            appData.tasks = Array.isArray(remoteData?.tasks) ? remoteData.tasks : [];
            appData.relations = remoteData?.relations || {};
            appData.checkedItems = remoteData?.checkedItems || {};
            appData.locations = Array.isArray(remoteData?.locations) ? remoteData.locations : [];
            if (typeof normalizeItemLocations === 'function') normalizeItemLocations();
            if (typeof normalizeItemData === 'function') normalizeItemData();
            localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
            localStorage.setItem(META_KEY, String(remoteUpdated));
            renderHomeTasks();
            if (typeof renderMasterItems === 'function') renderMasterItems();
            if (typeof renderMasterTasks === 'function') renderMasterTasks();
            if (typeof renderRelationsMatrix === 'function') renderRelationsMatrix();
            if (typeof renderLocations === 'function') renderLocations();
            if (typeof renderLocationOptions === 'function') renderLocationOptions('location-bag');
        } finally {
            suppressCloudSync = false;
        }
    }

    window.syncNow = async function () {
        if (!currentUser || !supabaseClient) {
            if (!currentUser) showMessage('同期するには同じアカウントでログインしてください。', 'error');
            return;
        }
        if (syncInProgress) return;
        syncInProgress = true;
        setStatus('同期中…', 'syncing');
        try {
            const { data: remote, error } = await supabaseClient
                .from('monocheck_data')
                .select('data, updated_at')
                .eq('user_id', currentUser.id)
                .maybeSingle();
            if (error) throw error;

            const localMeta = localStorage.getItem(META_KEY);
            const localUpdated = Number(localMeta || 0);

            // 初回のスマホなど、まだ一度もクラウド同期していない端末は
            // ローカルに自動生成された初期データを「最新」とみなさない。
            // 既存のクラウドデータがあれば必ずクラウドを優先する。
            if (!localMeta && remote) {
                const remoteUpdated = new Date(remote.updated_at).getTime();
                replaceLocalDataFromRemote(remote.data, remoteUpdated);
                showMessage('クラウドの最新データをこの端末に反映しました。', 'success');
                setStatus('同期済み', 'online');
                return;
            }

            if (!remote) {
                const timestamp = localUpdated || Date.now();
                const { error: upsertError } = await supabaseClient.from('monocheck_data').upsert({
                    user_id: currentUser.id,
                    data: appData,
                    updated_at: new Date(timestamp).toISOString()
                });
                if (upsertError) throw upsertError;
                localStorage.setItem(META_KEY, String(timestamp));
                showMessage('この端末のデータをクラウドに保存しました。', 'success');
                setStatus('同期済み', 'online');
                return;
            }

            const remoteUpdated = new Date(remote.updated_at).getTime();
            if (!Number.isFinite(remoteUpdated)) throw new Error('Supabaseのupdated_atを読み取れませんでした。');

            if (localUpdated > remoteUpdated + 1000) {
                const { error: upsertError } = await supabaseClient.from('monocheck_data').upsert({
                    user_id: currentUser.id,
                    data: appData,
                    updated_at: new Date(localUpdated).toISOString()
                });
                if (upsertError) throw upsertError;
            } else if (remoteUpdated > localUpdated + 1000) {
                replaceLocalDataFromRemote(remote.data, remoteUpdated);
            } else {
                // ほぼ同時刻の場合は、サーバー側の時刻を基準に合わせるだけにする。
                localStorage.setItem(META_KEY, String(remoteUpdated));
            }
            setStatus('同期済み', 'online');
        } catch (e) {
            console.error('Cloud sync error:', e);
            setStatus('同期エラー', 'error');
            showMessage(e?.message || '同期に失敗しました。Supabase、RLS、ログイン状態を確認してください。', 'error');
        } finally {
            syncInProgress = false;
        }
    };
})();
