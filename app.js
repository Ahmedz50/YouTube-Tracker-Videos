/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * YouTube Learning Tracker
 * Vanilla JavaScript (ES6+) with LocalStorage persistence.
 * Pure Dark Mode, Responsive Layout, Floating Action Button (FAB).
 */

(function () {
  'use strict';

  // Constants & Storage Keys
  const STORAGE_KEY = 'yt_learning_tracker_videos';

  // State Management
  let currentView = 'library'; // 'library' | 'dashboard'
  let currentFilter = 'all';  // 'all' | 'unwatched' | 'partial' | 'completed'
  let searchQuery = '';
  let pendingDeleteId = null;
  let activeFetchAbortController = null;

  // DOM Elements Cache
  const elements = {
    // Navbar & Views
    navButtons: document.querySelectorAll('.nav-link-btn'),
    viewLibrary: document.getElementById('view-library'),
    viewDashboard: document.getElementById('view-dashboard'),
    brandHomeLink: document.getElementById('brand-home-link'),
    btnFabAdd: document.getElementById('btn-fab-add'),

    // Library Toolbar & Badges
    searchInput: document.getElementById('search-input'),
    searchClearBtn: document.getElementById('search-clear-btn'),
    filterTabs: document.querySelectorAll('.filter-tab'),
    badgeAll: document.getElementById('badge-all'),
    badgeUnwatched: document.getElementById('badge-unwatched'),
    badgePartial: document.getElementById('badge-partial'),
    badgeCompleted: document.getElementById('badge-completed'),
    resultsSummary: document.getElementById('results-summary'),

    // Video Grid & Empty States
    videosGrid: document.getElementById('videos-grid'),
    emptyStateAll: document.getElementById('empty-state-all'),
    emptyStateFilter: document.getElementById('empty-state-filter'),
    emptyActionAddBtn: document.getElementById('empty-action-add'),
    emptyActionResetBtn: document.getElementById('empty-action-reset'),

    // Dashboard Elements
    dashProgressPct: document.getElementById('dash-progress-percentage'),
    progressSegCompleted: document.getElementById('progress-segment-completed'),
    progressSegPartial: document.getElementById('progress-segment-partial'),
    progressSegUnwatched: document.getElementById('progress-segment-unwatched'),
    dashLegendCompletedPct: document.getElementById('dash-legend-completed-pct'),
    dashLegendPartialPct: document.getElementById('dash-legend-partial-pct'),
    dashLegendUnwatchedPct: document.getElementById('dash-legend-unwatched-pct'),
    dashTotalCount: document.getElementById('dash-total-count'),
    dashCompletedCount: document.getElementById('dash-completed-count'),
    dashPartialCount: document.getElementById('dash-partial-count'),
    dashUnwatchedCount: document.getElementById('dash-unwatched-count'),
    recentVideosList: document.getElementById('recent-videos-list'),
    dashBtnGoLibrary: document.getElementById('dash-btn-go-library'),
    dashboardMetricCards: document.querySelectorAll('.metric-card'),

    // Add Video Modal
    addVideoModal: document.getElementById('add-video-modal'),
    modalYoutubeUrl: document.getElementById('modal-youtube-url'),
    fetchIndicator: document.getElementById('fetch-indicator'),
    modalPreviewBox: document.getElementById('modal-preview-box'),
    modalPreviewThumbImg: document.getElementById('modal-preview-thumb-img'),
    modalPreviewIdText: document.getElementById('modal-preview-id-text'),
    modalPreviewDetectedTitle: document.getElementById('modal-preview-detected-title-text'),
    modalVideoTitle: document.getElementById('modal-video-title'),
    modalVideoStatus: document.getElementById('modal-video-status'),
    modalAddError: document.getElementById('modal-add-error'),
    btnSaveVideo: document.getElementById('btn-save-video'),
    btnCancelAddModal: document.getElementById('btn-cancel-add-modal'),
    btnCloseAddModal: document.getElementById('btn-close-add-modal'),

    // Delete Modal
    deleteModal: document.getElementById('delete-modal'),
    deleteModalTitle: document.getElementById('delete-modal-video-title'),
    btnConfirmDelete: document.getElementById('btn-confirm-delete'),
    btnCancelDelete: document.getElementById('btn-cancel-delete'),

    // Toast Container
    toastContainer: document.getElementById('toast-container'),
  };

  // State for the video currently being prepared in Add Modal
  let currentAddVideoData = null;

  // =========================================================================
  // Core Storage & Data Helpers
  // =========================================================================

  /**
   * Retrieves saved videos from LocalStorage.
   * @returns {Array<Object>}
   */
  function getVideos() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (!data) return [];
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.error('Failed to read from localStorage:', error);
      showToast('تعذر استرجاع البيانات المحفوظة محليًا', 'error');
      return [];
    }
  }

  /**
   * Persists videos array to LocalStorage.
   * @param {Array<Object>} videos 
   * @returns {boolean}
   */
  function saveVideos(videos) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(videos));
      return true;
    } catch (error) {
      console.error('Failed to save to localStorage:', error);
      showToast('تعذر حفظ الفيديو. قد تكون الذاكرة المحلية ممتلئة.', 'error');
      return false;
    }
  }

  /**
   * Adds a new video object to storage.
   * @param {Object} videoData 
   * @returns {boolean}
   */
  function addVideo(videoData) {
    const videos = getVideos();

    // Check duplicate
    const exists = videos.some((v) => v.youtubeId === videoData.youtubeId);
    if (exists) {
      showModalError('هذا الفيديو موجود بالفعل في مكتبتك.');
      return false;
    }

    const updated = [videoData, ...videos];
    if (saveVideos(updated)) {
      renderVideos();
      updateStats();
      renderDashboard();
      showToast('تمت إضافة الفيديو إلى مكتبتك بنجاح!', 'success');
      return true;
    }
    return false;
  }

  /**
   * Updates the watch status of a specific video.
   * @param {string} id 
   * @param {'unwatched'|'partial'|'completed'} newStatus 
   */
  function updateVideoStatus(id, newStatus) {
    const validStatuses = ['unwatched', 'partial', 'completed'];
    if (!validStatuses.includes(newStatus)) return;

    const videos = getVideos();
    const videoIndex = videos.findIndex((v) => v.id === id || v.youtubeId === id);

    if (videoIndex === -1) return;

    videos[videoIndex].status = newStatus;
    videos[videoIndex].updatedAt = new Date().toISOString();

    if (saveVideos(videos)) {
      renderVideos();
      updateStats();
      renderDashboard();
      const statusLabels = {
        unwatched: 'لم أشاهد',
        partial: 'شاهدت جزءًا',
        completed: 'مكتمل',
      };
      showToast(`تم تحديث الحالة إلى: ${statusLabels[newStatus]}`, 'success');
    }
  }

  /**
   * Deletes a video by its unique ID.
   * @param {string} id 
   */
  function deleteVideo(id) {
    const videos = getVideos();
    const updated = videos.filter((v) => v.id !== id && v.youtubeId !== id);

    if (saveVideos(updated)) {
      renderVideos();
      updateStats();
      renderDashboard();
      showToast('تم حذف الفيديو من المكتبة', 'success');
    }
  }

  /**
   * Extracts YouTube Video ID safely from any common YouTube URL format.
   * @param {string} url 
   * @returns {string|null} 11-char ID
   */
  function extractYouTubeId(url) {
    if (!url || typeof url !== 'string') return null;
    const trimmed = url.trim();

    // Direct 11-char ID
    if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
      return trimmed;
    }

    try {
      let cleanUrl = trimmed;
      if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
        cleanUrl = 'https://' + cleanUrl;
      }
      const parsed = new URL(cleanUrl);
      const host = parsed.hostname.toLowerCase();

      // youtu.be/VIDEO_ID
      if (host === 'youtu.be' || host.endsWith('.youtu.be')) {
        const pathParts = parsed.pathname.split('/').filter(Boolean);
        if (pathParts.length > 0) {
          const id = pathParts[0].split('?')[0];
          if (/^[a-zA-Z0-9_-]{11}$/.test(id)) return id;
        }
      }

      // youtube.com, www.youtube.com, m.youtube.com
      if (host.includes('youtube.com')) {
        // Query param ?v=VIDEO_ID
        const vParam = parsed.searchParams.get('v');
        if (vParam && /^[a-zA-Z0-9_-]{11}$/.test(vParam)) {
          return vParam;
        }

        // Paths: /shorts/VIDEO_ID or /embed/VIDEO_ID or /v/VIDEO_ID
        const parts = parsed.pathname.split('/').filter(Boolean);
        if (parts.length >= 2 && ['shorts', 'embed', 'v'].includes(parts[0])) {
          const id = parts[1].split('?')[0];
          if (/^[a-zA-Z0-9_-]{11}$/.test(id)) return id;
        }
      }
    } catch (e) {
      // Fallback to regex
    }

    try {
      const pattern = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?|shorts)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
      const match = trimmed.match(pattern);
      if (match && match[1] && /^[a-zA-Z0-9_-]{11}$/.test(match[1])) {
        return match[1];
      }
    } catch (e) {
      console.warn('Regex parsing error:', e);
    }

    return null;
  }

  // =========================================================================
  // Automatic YouTube Video Title Fetching
  // =========================================================================

  /**
   * Automatically fetches the video title from YouTube's oEmbed endpoint.
   * Includes fallback to noembed service.
   * @param {string} videoId 
   * @param {AbortSignal} signal 
   * @returns {Promise<string|null>}
   */
  async function fetchYouTubeTitle(videoId, signal) {
    const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;

    // 1. Primary: Official YouTube oEmbed
    try {
      const oEmbedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`;
      const res = await fetch(oEmbedUrl, { signal });
      if (res.ok) {
        const data = await res.json();
        if (data && data.title) {
          return data.title.trim();
        }
      }
    } catch (err) {
      if (err && err.name === 'AbortError') return null;
      console.log('YouTube official oEmbed check failed, attempting proxy fallback...', err);
    }

    // 2. Secondary Fallback: noembed.com
    try {
      const noEmbedUrl = `https://noembed.com/embed?url=${encodeURIComponent(watchUrl)}`;
      const res = await fetch(noEmbedUrl, { signal });
      if (res.ok) {
        const data = await res.json();
        if (data && data.title) {
          return data.title.trim();
        }
      }
    } catch (err) {
      if (err && err.name === 'AbortError') return null;
      console.log('Noembed fallback check error:', err);
    }

    return null;
  }

  // =========================================================================
  // View Navigation (Library vs Dashboard)
  // =========================================================================

  function switchView(viewName) {
    if (viewName !== 'library' && viewName !== 'dashboard') return;
    currentView = viewName;

    // Update Nav buttons state
    elements.navButtons.forEach((btn) => {
      const target = btn.getAttribute('data-view');
      if (target === viewName) {
        btn.classList.add('active');
        btn.setAttribute('aria-selected', 'true');
      } else {
        btn.classList.remove('active');
        btn.setAttribute('aria-selected', 'false');
      }
    });

    // Toggle View Sections
    if (viewName === 'library') {
      elements.viewLibrary.classList.add('active');
      elements.viewDashboard.classList.remove('active');
      renderVideos();
    } else {
      elements.viewLibrary.classList.remove('active');
      elements.viewDashboard.classList.add('active');
      renderDashboard();
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // =========================================================================
  // Library Rendering & Filter Logic
  // =========================================================================

  function filterVideos() {
    const allVideos = getVideos();
    const query = searchQuery.trim().toLowerCase();

    return allVideos.filter((video) => {
      const matchesFilter =
        currentFilter === 'all' || video.status === currentFilter;

      const matchesSearch =
        !query ||
        (video.title && video.title.toLowerCase().includes(query)) ||
        (video.youtubeId && video.youtubeId.toLowerCase().includes(query));

      return matchesFilter && matchesSearch;
    });
  }

  function updateStats() {
    const videos = getVideos();

    let total = videos.length;
    let unwatched = 0;
    let partial = 0;
    let completed = 0;

    videos.forEach((v) => {
      if (v.status === 'unwatched') unwatched++;
      else if (v.status === 'partial') partial++;
      else if (v.status === 'completed') completed++;
    });

    // Update filter tab counts in library
    if (elements.badgeAll) elements.badgeAll.textContent = total;
    if (elements.badgeUnwatched) elements.badgeUnwatched.textContent = unwatched;
    if (elements.badgePartial) elements.badgePartial.textContent = partial;
    if (elements.badgeCompleted) elements.badgeCompleted.textContent = completed;
  }

  function renderVideos() {
    const allVideos = getVideos();
    const filtered = filterVideos();

    elements.videosGrid.innerHTML = '';

    if (allVideos.length === 0) {
      elements.emptyStateAll.style.display = 'flex';
      elements.emptyStateFilter.style.display = 'none';
      if (elements.resultsSummary) elements.resultsSummary.style.display = 'none';
      return;
    }

    elements.emptyStateAll.style.display = 'none';

    if (filtered.length === 0) {
      elements.emptyStateFilter.style.display = 'flex';
      if (elements.resultsSummary) elements.resultsSummary.style.display = 'none';
      return;
    }

    elements.emptyStateFilter.style.display = 'none';

    if (elements.resultsSummary) {
      elements.resultsSummary.style.display = 'flex';
      const summaryText = elements.resultsSummary.querySelector('.summary-text');
      if (summaryText) {
        summaryText.textContent = `عرض ${filtered.length} من أصل ${allVideos.length} فيديو`;
      }
    }

    const fragment = document.createDocumentFragment();
    filtered.forEach((video) => {
      const card = createVideoCardElement(video);
      fragment.appendChild(card);
    });

    elements.videosGrid.appendChild(fragment);
  }

  function createVideoCardElement(video) {
    const card = document.createElement('article');
    card.className = 'video-card';
    card.setAttribute('data-id', video.id || video.youtubeId);

    // Thumbnail Link
    const thumbWrapper = document.createElement('a');
    thumbWrapper.className = 'card-thumbnail-wrapper';
    thumbWrapper.href = video.url;
    thumbWrapper.target = '_blank';
    thumbWrapper.rel = 'noopener noreferrer';
    thumbWrapper.setAttribute('aria-label', `مشاهدة فيديو: ${video.title}`);

    const img = document.createElement('img');
    img.className = 'card-thumbnail';
    img.src = video.thumbnail;
    img.alt = video.title || 'فيديو يوتيوب';
    img.loading = 'lazy';
    img.onerror = function () {
      this.src = `https://img.youtube.com/vi/${video.youtubeId}/hqdefault.jpg`;
    };

    const overlay = document.createElement('div');
    overlay.className = 'card-play-overlay';
    overlay.innerHTML = `
      <div class="play-icon-badge" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
      </div>
    `;

    const statusBadge = document.createElement('div');
    statusBadge.className = 'card-status-badge';
    statusBadge.setAttribute('data-status', video.status);

    const statusLabels = {
      unwatched: 'لم أشاهد',
      partial: 'شاهدت جزءًا',
      completed: 'مكتمل',
    };

    const statusIcons = {
      unwatched: '○',
      partial: '🟡',
      completed: '✓',
    };

    statusBadge.textContent = `${statusIcons[video.status] || ''} ${statusLabels[video.status] || ''}`;

    thumbWrapper.appendChild(img);
    thumbWrapper.appendChild(overlay);
    thumbWrapper.appendChild(statusBadge);

    // Body
    const body = document.createElement('div');
    body.className = 'card-body';

    const title = document.createElement('h3');
    title.className = 'card-title';
    title.textContent = video.title || 'فيديو بدون عنوان';
    title.title = video.title || '';

    // Status Selector Control
    const statusControl = document.createElement('div');
    statusControl.className = 'card-status-control';

    const statusControlLabel = document.createElement('span');
    statusControlLabel.className = 'status-control-label';
    statusControlLabel.textContent = 'حالة المشاهدة:';

    const statusButtonGroup = document.createElement('div');
    statusButtonGroup.className = 'status-buttons-group';
    statusButtonGroup.setAttribute('role', 'group');

    const statuses = [
      { key: 'unwatched', label: 'لم أشاهد' },
      { key: 'partial', label: 'شاهدت جزءًا' },
      { key: 'completed', label: 'مكتمل' },
    ];

    statuses.forEach((st) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `status-btn ${video.status === st.key ? 'active' : ''}`;
      btn.setAttribute('data-target-status', st.key);
      btn.textContent = st.label;
      btn.setAttribute('aria-pressed', video.status === st.key ? 'true' : 'false');

      btn.addEventListener('click', () => {
        if (video.status !== st.key) {
          updateVideoStatus(video.id || video.youtubeId, st.key);
        }
      });

      statusButtonGroup.appendChild(btn);
    });

    statusControl.appendChild(statusControlLabel);
    statusControl.appendChild(statusButtonGroup);

    // Footer
    const footer = document.createElement('div');
    footer.className = 'card-footer';

    const watchLink = document.createElement('a');
    watchLink.className = 'card-watch-link';
    watchLink.href = video.url;
    watchLink.target = '_blank';
    watchLink.rel = 'noopener noreferrer';
    watchLink.innerHTML = `
      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
      <span>مشاهدة</span>
    `;

    const actionsRight = document.createElement('div');
    actionsRight.className = 'card-actions-right';

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'card-delete-btn';
    deleteBtn.title = 'حذف هذا الفيديو';
    deleteBtn.setAttribute('aria-label', `حذف فيديو: ${video.title}`);
    deleteBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="3 6 5 6 21 6"></polyline>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        <line x1="10" y1="11" x2="10" y2="17"></line>
        <line x1="14" y1="11" x2="14" y2="17"></line>
      </svg>
    `;

    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openDeleteConfirmation(video);
    });

    actionsRight.appendChild(deleteBtn);
    footer.appendChild(watchLink);
    footer.appendChild(actionsRight);

    body.appendChild(title);
    body.appendChild(statusControl);
    body.appendChild(footer);

    card.appendChild(thumbWrapper);
    card.appendChild(body);

    return card;
  }

  // =========================================================================
  // Dashboard Page Rendering (Dedicated View)
  // =========================================================================

  function renderDashboard() {
    const videos = getVideos();
    const total = videos.length;

    let unwatched = 0;
    let partial = 0;
    let completed = 0;

    videos.forEach((v) => {
      if (v.status === 'unwatched') unwatched++;
      else if (v.status === 'partial') partial++;
      else if (v.status === 'completed') completed++;
    });

    // Percentages
    const completedPct = total > 0 ? Math.round((completed / total) * 100) : 0;
    const partialPct = total > 0 ? Math.round((partial / total) * 100) : 0;
    const unwatchedPct = total > 0 ? Math.round((unwatched / total) * 100) : 0;

    // Progress Bar Elements
    if (elements.dashProgressPct) {
      elements.dashProgressPct.textContent = `${completedPct}%`;
    }
    if (elements.progressSegCompleted) {
      elements.progressSegCompleted.style.width = `${completedPct}%`;
    }
    if (elements.progressSegPartial) {
      elements.progressSegPartial.style.width = `${partialPct}%`;
    }
    if (elements.progressSegUnwatched) {
      elements.progressSegUnwatched.style.width = `${unwatchedPct}%`;
    }

    if (elements.dashLegendCompletedPct) elements.dashLegendCompletedPct.textContent = `${completedPct}%`;
    if (elements.dashLegendPartialPct) elements.dashLegendPartialPct.textContent = `${partialPct}%`;
    if (elements.dashLegendUnwatchedPct) elements.dashLegendUnwatchedPct.textContent = `${unwatchedPct}%`;

    // Metrics Values
    if (elements.dashTotalCount) elements.dashTotalCount.textContent = total;
    if (elements.dashCompletedCount) elements.dashCompletedCount.textContent = completed;
    if (elements.dashPartialCount) elements.dashPartialCount.textContent = partial;
    if (elements.dashUnwatchedCount) elements.dashUnwatchedCount.textContent = unwatched;

    // Recent Videos List
    if (elements.recentVideosList) {
      elements.recentVideosList.innerHTML = '';

      if (videos.length === 0) {
        elements.recentVideosList.innerHTML = `
          <div style="padding: 1.5rem; text-align: center; color: var(--text-muted); font-size: 0.9rem;">
            لا توجد فيديوهات مضافة بعد.
          </div>
        `;
      } else {
        const recent = videos.slice(0, 5);
        recent.forEach((v) => {
          const item = document.createElement('div');
          item.className = 'recent-item';

          const infoWrap = document.createElement('div');
          infoWrap.className = 'recent-item-info';

          const img = document.createElement('img');
          img.className = 'recent-thumb';
          img.src = v.thumbnail;
          img.alt = v.title || '';

          const textCol = document.createElement('div');
          textCol.style.overflow = 'hidden';

          const titleEl = document.createElement('div');
          titleEl.className = 'recent-title-text';
          titleEl.textContent = v.title || 'فيديو بدون عنوان';

          const statusText = document.createElement('span');
          statusText.style.fontSize = '0.75rem';
          statusText.style.color = 'var(--text-muted)';
          const statusLabels = { unwatched: 'لم أشاهد', partial: 'شاهدت جزءًا', completed: 'مكتمل' };
          statusText.textContent = `الحالة: ${statusLabels[v.status] || ''}`;

          textCol.appendChild(titleEl);
          textCol.appendChild(statusText);

          infoWrap.appendChild(img);
          infoWrap.appendChild(textCol);

          const watchBtn = document.createElement('a');
          watchBtn.className = 'card-watch-link';
          watchBtn.href = v.url;
          watchBtn.target = '_blank';
          watchBtn.rel = 'noopener noreferrer';
          watchBtn.style.padding = '0.35rem 0.75rem';
          watchBtn.style.fontSize = '0.8rem';
          watchBtn.style.minHeight = '30px';
          watchBtn.innerHTML = `<span>مشاهدة</span>`;

          item.appendChild(infoWrap);
          item.appendChild(watchBtn);
          elements.recentVideosList.appendChild(item);
        });
      }
    }
  }

  // =========================================================================
  // Add Video Modal & Title Auto-Fetch Handling
  // =========================================================================

  function openAddModal() {
    clearModalError();
    elements.addVideoModal.classList.add('active');
    setTimeout(() => {
      elements.modalYoutubeUrl.focus();
    }, 100);
  }

  function closeAddModal() {
    if (activeFetchAbortController) {
      activeFetchAbortController.abort();
      activeFetchAbortController = null;
    }
    currentAddVideoData = null;
    elements.modalYoutubeUrl.value = '';
    elements.modalVideoTitle.value = '';
    elements.modalPreviewBox.classList.remove('active');
    elements.fetchIndicator.classList.remove('active');
    clearModalError();
    elements.addVideoModal.classList.remove('active');
  }

  /**
   * Processes the entered URL: validates, extracts ID, loads thumbnail,
   * and automatically fetches the YouTube title!
   */
  async function handleUrlInputProcess() {
    clearModalError();
    const rawUrl = elements.modalYoutubeUrl.value.trim();
    if (!rawUrl) {
      elements.modalPreviewBox.classList.remove('active');
      elements.fetchIndicator.classList.remove('active');
      currentAddVideoData = null;
      return;
    }

    const videoId = extractYouTubeId(rawUrl);
    if (!videoId) {
      showModalError('يرجى إدخال رابط YouTube صحيح.');
      elements.modalPreviewBox.classList.remove('active');
      elements.fetchIndicator.classList.remove('active');
      currentAddVideoData = null;
      return;
    }

    // Check duplicate
    const videos = getVideos();
    const isDuplicate = videos.some((v) => v.youtubeId === videoId);
    if (isDuplicate) {
      showModalError('هذا الفيديو موجود بالفعل في مكتبتك.');
    }

    const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
    const standardUrl = `https://www.youtube.com/watch?v=${videoId}`;

    currentAddVideoData = {
      id: videoId,
      youtubeId: videoId,
      url: standardUrl,
      thumbnail: thumbnailUrl,
      status: elements.modalVideoStatus ? elements.modalVideoStatus.value : 'unwatched',
    };

    // Show Preview Box with Thumbnail immediately
    elements.modalPreviewThumbImg.src = thumbnailUrl;
    elements.modalPreviewIdText.textContent = `ID: ${videoId}`;
    elements.modalPreviewDetectedTitle.textContent = 'جاري جلب العنوان...';
    elements.modalPreviewBox.classList.add('active');

    // Auto-fetch Title
    if (activeFetchAbortController) {
      activeFetchAbortController.abort();
    }
    activeFetchAbortController = new AbortController();
    elements.fetchIndicator.classList.add('active');

    try {
      const fetchedTitle = await fetchYouTubeTitle(videoId, activeFetchAbortController.signal);
      elements.fetchIndicator.classList.remove('active');

      if (fetchedTitle) {
        elements.modalVideoTitle.value = fetchedTitle;
        elements.modalPreviewDetectedTitle.textContent = fetchedTitle;
      } else {
        if (!elements.modalVideoTitle.value.trim()) {
          elements.modalVideoTitle.placeholder = 'أدخل عنوان الفيديو يدويًا...';
          elements.modalPreviewDetectedTitle.textContent = 'يمكنك كتابة العنوان بالأسفل';
        }
      }
    } catch (err) {
      elements.fetchIndicator.classList.remove('active');
      console.warn('Title fetch error:', err);
    }
  }

  function handleSaveVideoFromModal() {
    clearModalError();

    if (!currentAddVideoData) {
      showModalError('يرجى إدخال رابط فيديو YouTube أولاً.');
      elements.modalYoutubeUrl.focus();
      return;
    }

    const title = elements.modalVideoTitle.value.trim();
    if (!title) {
      showModalError('يرجى إدخال عنوان الفيديو.');
      elements.modalVideoTitle.focus();
      return;
    }

    const finalStatus = elements.modalVideoStatus.value || 'unwatched';

    const newVideo = {
      ...currentAddVideoData,
      title: title,
      status: finalStatus,
      createdAt: new Date().toISOString(),
    };

    const success = addVideo(newVideo);
    if (success) {
      closeAddModal();
      switchView('library');
    }
  }

  function showModalError(msg) {
    if (elements.modalAddError) {
      elements.modalAddError.textContent = msg;
      elements.modalAddError.classList.add('active');
    }
  }

  function clearModalError() {
    if (elements.modalAddError) {
      elements.modalAddError.textContent = '';
      elements.modalAddError.classList.remove('active');
    }
  }

  // =========================================================================
  // Delete Confirmation Modal
  // =========================================================================

  function openDeleteConfirmation(video) {
    pendingDeleteId = video.id || video.youtubeId;
    if (elements.deleteModalTitle) {
      elements.deleteModalTitle.textContent = video.title || 'هذا الفيديو';
    }
    if (elements.deleteModal) {
      elements.deleteModal.classList.add('active');
      elements.btnConfirmDelete.focus();
    }
  }

  function closeDeleteConfirmation() {
    pendingDeleteId = null;
    if (elements.deleteModal) {
      elements.deleteModal.classList.remove('active');
    }
  }

  function handleConfirmDelete() {
    if (pendingDeleteId) {
      deleteVideo(pendingDeleteId);
    }
    closeDeleteConfirmation();
  }

  // =========================================================================
  // Toast Notifications
  // =========================================================================

  function showToast(message, type = 'info') {
    if (!elements.toastContainer) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;

    elements.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.25s ease';
      setTimeout(() => toast.remove(), 250);
    }, 2800);
  }

  // =========================================================================
  // Event Listeners & Setup
  // =========================================================================

  function setupEventListeners() {
    // Navigation Tabs
    elements.navButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetView = btn.getAttribute('data-view');
        switchView(targetView);
      });
    });

    if (elements.brandHomeLink) {
      elements.brandHomeLink.addEventListener('click', () => {
        switchView('library');
      });
    }

    if (elements.dashBtnGoLibrary) {
      elements.dashBtnGoLibrary.addEventListener('click', () => {
        switchView('library');
      });
    }

    // Metric Cards on Dashboard jump to Library with filter
    elements.dashboardMetricCards.forEach((card) => {
      card.addEventListener('click', () => {
        const metric = card.getAttribute('data-metric');
        const filterMap = {
          total: 'all',
          completed: 'completed',
          partial: 'partial',
          unwatched: 'unwatched',
        };
        const targetFilter = filterMap[metric] || 'all';

        currentFilter = targetFilter;
        elements.filterTabs.forEach((tab) => {
          if (tab.getAttribute('data-filter') === targetFilter) {
            tab.classList.add('active');
          } else {
            tab.classList.remove('active');
          }
        });

        switchView('library');
      });
    });

    // Floating Action Button (FAB) Bottom-Left
    if (elements.btnFabAdd) {
      elements.btnFabAdd.addEventListener('click', openAddModal);
    }

    // Modal Close buttons
    if (elements.btnCloseAddModal) {
      elements.btnCloseAddModal.addEventListener('click', closeAddModal);
    }
    if (elements.btnCancelAddModal) {
      elements.btnCancelAddModal.addEventListener('click', closeAddModal);
    }
    if (elements.btnSaveVideo) {
      elements.btnSaveVideo.addEventListener('click', handleSaveVideoFromModal);
    }

    // Close modal on backdrop click
    if (elements.addVideoModal) {
      elements.addVideoModal.addEventListener('click', (e) => {
        if (e.target === elements.addVideoModal) {
          closeAddModal();
        }
      });
    }

    // Input URL detection: typing, paste, enter
    let urlDebounceTimer = null;
    if (elements.modalYoutubeUrl) {
      elements.modalYoutubeUrl.addEventListener('input', () => {
        clearTimeout(urlDebounceTimer);
        urlDebounceTimer = setTimeout(handleUrlInputProcess, 300);
      });

      elements.modalYoutubeUrl.addEventListener('paste', () => {
        setTimeout(handleUrlInputProcess, 50);
      });

      elements.modalYoutubeUrl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleUrlInputProcess();
        }
      });
    }

    if (elements.modalVideoTitle) {
      elements.modalVideoTitle.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleSaveVideoFromModal();
        }
      });
    }

    // Quick Sample Buttons inside Modal
    document.querySelectorAll('.btn-quick-sample').forEach((btn) => {
      btn.addEventListener('click', () => {
        const sampleUrl = btn.getAttribute('data-url');
        if (elements.modalYoutubeUrl && sampleUrl) {
          elements.modalYoutubeUrl.value = sampleUrl;
          handleUrlInputProcess();
        }
      });
    });

    // Search input in Library
    if (elements.searchInput) {
      elements.searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        if (elements.searchClearBtn) {
          if (searchQuery.trim().length > 0) {
            elements.searchClearBtn.classList.add('active');
          } else {
            elements.searchClearBtn.classList.remove('active');
          }
        }
        renderVideos();
      });
    }

    if (elements.searchClearBtn) {
      elements.searchClearBtn.addEventListener('click', () => {
        elements.searchInput.value = '';
        searchQuery = '';
        elements.searchClearBtn.classList.remove('active');
        elements.searchInput.focus();
        renderVideos();
      });
    }

    // Filter Tabs in Library
    elements.filterTabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        elements.filterTabs.forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        currentFilter = tab.getAttribute('data-filter') || 'all';
        renderVideos();
      });
    });

    // Empty state buttons
    if (elements.emptyActionAddBtn) {
      elements.emptyActionAddBtn.addEventListener('click', openAddModal);
    }

    if (elements.emptyActionResetBtn) {
      elements.emptyActionResetBtn.addEventListener('click', () => {
        searchQuery = '';
        if (elements.searchInput) elements.searchInput.value = '';
        if (elements.searchClearBtn) elements.searchClearBtn.classList.remove('active');
        currentFilter = 'all';
        elements.filterTabs.forEach((t) => {
          if (t.getAttribute('data-filter') === 'all') t.classList.add('active');
          else t.classList.remove('active');
        });
        renderVideos();
      });
    }

    // Delete modal buttons
    if (elements.btnConfirmDelete) {
      elements.btnConfirmDelete.addEventListener('click', handleConfirmDelete);
    }
    if (elements.btnCancelDelete) {
      elements.btnCancelDelete.addEventListener('click', closeDeleteConfirmation);
    }
    if (elements.deleteModal) {
      elements.deleteModal.addEventListener('click', (e) => {
        if (e.target === elements.deleteModal) {
          closeDeleteConfirmation();
        }
      });
    }

    // Global keyboard shortcuts (Esc)
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (elements.addVideoModal && elements.addVideoModal.classList.contains('active')) {
          closeAddModal();
        }
        if (elements.deleteModal && elements.deleteModal.classList.contains('active')) {
          closeDeleteConfirmation();
        }
      }
    });
  }

  // =========================================================================
  // Initialization
  // =========================================================================

  function init() {
    setupEventListeners();
    updateStats();
    renderVideos();
    renderDashboard();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose global methods for debugging
  window.YTTracker = {
    getVideos,
    saveVideos,
    addVideo,
    updateVideoStatus,
    deleteVideo,
    renderVideos,
    updateStats,
    renderDashboard,
    switchView,
    openAddModal,
    extractYouTubeId,
    fetchYouTubeTitle,
  };
})();
