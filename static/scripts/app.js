import { ImageActions } from '/vendor/cdn.jsdelivr.net/npm/@xeger/quill-image-actions/lib/index.mjs';
import { ImageFormats } from '/vendor/cdn.jsdelivr.net/npm/@xeger/quill-image-formats/lib/index.mjs';

const PAGES_API_URL = '/api/v1/pages';
const IMAGES_API_URL = '/api/v1/images';
const SEARCH_API_URL = '/api/v1/search';
const AUTO_SAVE_INTERVAL = 1000;
const MAX_NAVIGATION_HISTORY = 5;

let navigationHistory = [];
const Delta = Quill.import('delta');

Quill.register('modules/imageActions', ImageActions);
Quill.register('modules/imageFormats', ImageFormats);

const quill = new Quill('#html-content-editor', {
    formats: [
        "background",
        "bold",
        "header",
        "image",
        "video",
        "link",
        "underline",
        "width",
        "code-block",
    ],
    modules: {
        imageActions: {},
        imageFormats: {},
        magicUrl: {
            urlRegularExpression: /(?:^|(?<=\s))https?:\/\/[^\s]+/i,
            globalRegularExpression: /(?:^|(?<=\s))https?:\/\/[^\s]+/ig,
        },
        toolbar: {
            container: '#toolbar',
            handlers: {
                link: linkHandler,
                image: imageHandler,
                video: videoHandler
            }
        }
    }
});

let lastKnownRange = null;

quill.on('selection-change', (range) => {
    if (range) {
        lastKnownRange = range;
    }
});

quill.root.addEventListener('paste', async (e) => {
    const items = Array.from(e.clipboardData.items);
    const imageItems = items.filter(item => item.type.startsWith("image"));
    if (imageItems.length === 0) {
        return;
    }
    e.preventDefault();
    for (const item of imageItems) {
        const file = item.getAsFile();
        const imageUrl = await uploadImage(file);
        const range = quill.getSelection() || lastKnownRange;
        quill.insertEmbed(range.index, 'image', imageUrl, Quill.sources.USER);
    }
});

function linkHandler(value) {
    if (!value) {
        quill.format('link', false);
        return;
    }
    displayModalDialog({
        title: 'Insert Link',
        message: 'Enter the URL for the link:',
        withInput: true,
        buttons: [
            {
                classList: ['modal-button-cancel'],
                caption: 'Cancel'
            },
            {
                classList: ['modal-button-action'],
                caption: 'Insert',
                callbackFn: async (url) => {
                    quill.format('link', url);
                },
                validateFn: (url) => {
                    url = url.trim();
                    if (!url) {
                        return 'The URL must be specified.';
                    }
                    return null;
                }
            }
        ]
    });
}

function imageHandler() {
    const range = quill.getSelection();
    const inputEl = document.createElement("input");
    inputEl.setAttribute("type", "file");
    inputEl.setAttribute("accept", "image/*");
    inputEl.addEventListener('change', async (ev) => {
        const file = ev.target.files[0];
        const imageUrl = await uploadImage(file);
        quill.insertEmbed(range.index, 'image', imageUrl, Quill.sources.USER);
    });
    inputEl.click();
}

async function uploadImage(file) {
    const currentRoute = decodeURIComponent(window.location.hash.slice(1));
    const formData = new FormData();
    formData.append('file', file);
    try {
        const response = await fetch(IMAGES_API_URL + currentRoute, {
            method: 'POST',
            body: formData
        });
        if (!response.ok) {
            throw new Error(`Failed to upload image: ${response.statusText}`);
        }
        const data = await response.json();
        return data.url;
    } catch (error) {
        displayErrorPopup(error);
    }
}

function videoHandler() {
    const range = quill.getSelection();
    displayModalDialog({
        title: 'Insert Video',
        message: 'Enter the URL for the video:',
        withInput: true,
        buttons: [
            {
                classList: ['modal-button-cancel'],
                caption: 'Cancel'
            },
            {
                classList: ['modal-button-action'],
                caption: 'Insert',
                callbackFn: async (url) => {
                    quill.insertEmbed(range.index, 'video', url);
                },
                validateFn: (url) => {
                    url = url.trim();
                    if (!url) {
                        return 'The URL must be specified.';
                    }
                    return null;
                }
            }
        ]
    });
}

let currentChange; /* = {
    page: '/some/page',
    delta: ...,
    version: 1
}; */

function displayErrorPopup(message = 'An unknown error has occurred.', timeout = 5000) {
    const errorPopupEl = document.getElementById('error-popup');
    errorPopupEl.innerText = message;

    document.documentElement.classList.add('error-popup');
    setTimeout(() => document.documentElement.classList.remove('error-popup'), timeout);
}

window.addEventListener('error', (ev) => displayErrorPopup(ev.message));
window.addEventListener('unhandledrejection', (ev) => displayErrorPopup(ev.reason.message));

function renderSidebarNavigation(containerEl, treeData, basePath = '') {
    const currentRoute = decodeURIComponent(window.location.hash.slice(1));

    for (const [pageName, subTreeData] of Object.entries(treeData)) {
        const pagePath = `${basePath}/${pageName}`;
        const isCurrentPage = currentRoute === pagePath;
        const isCurrentPath = currentRoute.startsWith(pagePath);

        const detailsEl = document.createElement('details');
        detailsEl.open = isCurrentPath;

        const summaryEl = document.createElement('summary');
        summaryEl.textContent = pageName;
        summaryEl.dataset.pagePath = pagePath;

        if (isCurrentPage) {
            summaryEl.classList.add('selected');
        }

        detailsEl.appendChild(summaryEl);

        if (Object.keys(subTreeData).length === 0) {
            detailsEl.classList.add('leaf');
        } else {
            renderSidebarNavigation(detailsEl, subTreeData, pagePath);
        }

        containerEl.appendChild(detailsEl);
    }
}

async function loadSidebarNavigationTree() {
    const treeData = await getPages();
    const fragment = document.createDocumentFragment();

    renderSidebarNavigation(fragment, treeData);

    const sidebarNavigationEl = document.getElementById('sidebar-navigation');
    sidebarNavigationEl.replaceChildren(fragment);
}

function updateHistoryLinks() {
    const route = decodeURIComponent(window.location.hash.slice(1));
    const historyLinks = document.getElementById('history-links');
    historyLinks.innerHTML = '';
    navigationHistory.forEach((page) => {
        const a = document.createElement('a');
        a.href = `#${page}`;
        a.textContent = page.substring(page.lastIndexOf("/") + 1);
        a.className = "navigation-history-item";
        if (page === route) {
            a.classList.add('selected');
        }
        historyLinks.appendChild(a);
    });
}

function addHistoryLink(link) {
    link = link || decodeURIComponent(window.location.hash.slice(1));
    if (navigationHistory.includes(link)) {
        return;
    }
    navigationHistory.push(link);
    if (navigationHistory.length > MAX_NAVIGATION_HISTORY) {
        navigationHistory.shift();
    }
}

function removeHistoryLink(link) {
    link = link || decodeURIComponent(window.location.hash.slice(1));
    navigationHistory = navigationHistory.filter((item) => item !== link);
}

async function getPages() {
    const response = await fetch(PAGES_API_URL, {
        method: 'GET',
        headers: {
            'Accept': 'application/json'
        }
    });
    if (!response.ok) {
        throw new Error(`Failed to get pages: ${response.statusText}`);
    }
    return await response.json();
}

async function searchPages(q) {
    const response = await fetch(SEARCH_API_URL + "?q=" + encodeURIComponent(q), {
        method: 'GET',
        headers: {
            'Accept': 'application/json'
        }
    });
    if (!response.ok) {
        throw new Error(`Failed to get pages: ${response.statusText}`);
    }
    return await response.json();
}

async function getPage(page) {
    const response = await fetch(PAGES_API_URL + page, {
        headers: {
            'Accept': 'application/json'
        }
    });
    if (!response.ok) {
        throw new Error(`Failed to get page: ${response.statusText}`);
    }
    return await response.json();
}

async function createPage(page) {
    const response = await fetch(PAGES_API_URL + page, {
        method: 'POST',
    });
    if (!response.ok) {
        throw new Error(`Failed to create page: ${response.statusText}`);
    }
}

async function deletePage(page) {
    const response = await fetch(PAGES_API_URL + page, {
        method: 'DELETE',
    });
    if (!response.ok) {
        throw new Error(`Failed to delete page: ${response.statusText}`);
    }
}

async function patchPage(page, patch) {
    const response = await fetch(PAGES_API_URL + page, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(patch)
    });
    if (!response.ok) {
        throw new Error(`Failed to patch page: ${response.statusText}`);
    }
}

async function renamePage(page, newPath) {
    try {
        await patchPage(page, { type: "move", data: newPath });
    } catch (error) {
        throw new Error(`Failed to rename page: ${error.message}`);
    }
}

async function loadEditorContent() {
    const currentRoute = decodeURIComponent(window.location.hash.slice(1));
    if (currentRoute.length === 0) {
        document.documentElement.classList.add('home');
        return;
    } else {
        document.documentElement.classList.remove('home');
    }

    quill.off('text-change');
    quill.disable();

    await syncPendingChanges(); // Before loading a new page, make sure to save the current changes first.

    const { metadata, data } = await getPage(currentRoute);

    quill.setContents(data);
    currentChange = { page: currentRoute, delta: new Delta(), version: metadata.version + 1 };

    quill.enable();
    quill.focus();
    quill.setSelection(quill.getLength(), 0);

    quill.on('text-change', (delta, oldDelta, source) => {
        // if (source !== 'user') {
        //     // Ignore changes not originating from the user (e.g. changes from the initial load).
        //     return;
        // }
        currentChange.delta = currentChange.delta.compose(delta);
    });
}

function setupSidebarInteractions() {
    const sidebarNavigationEl = document.getElementById('sidebar-navigation');
    sidebarNavigationEl.addEventListener('click', (ev) => {
        if (ev.target.tagName !== 'SUMMARY') {
            return;
        }

        const currentRoute = decodeURIComponent(window.location.hash.slice(1));
        if (ev.target.dataset.pagePath != currentRoute) {
            // If the clicked navigation item is not the current page, then do not toggle the details element.
            // Otherwise, the clicked navigation item will flicker when the details element is closed and then opened
            // again.
            ev.preventDefault();
        }

        window.location.hash = ev.target.dataset.pagePath;
    });

    const sidebarEl = document.querySelector('.sidebar');
    const sidebarToggleEl = document.querySelector('.sidebar-toggle');
    sidebarToggleEl.addEventListener('click', () => {
        sidebarEl.classList.toggle('collapsed')
    });

    function handleMediaQueryChange(ev) {
        sidebarEl.classList.toggle('collapsed', ev.matches);
    }

    const mediaQuery = window.matchMedia('(max-width: 768px)');
    mediaQuery.addEventListener('change', handleMediaQueryChange);
    handleMediaQueryChange(mediaQuery);

    const handleEl = document.getElementById("sidebar-resize-handle");
    let isResizing = false;

    handleEl.addEventListener('mousedown', function (e) {
        e.preventDefault();
        isResizing = true;

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', stopResize);
    });

    const minWidth = 200;
    function handleMouseMove(e) {
        if (!isResizing) {
            return;
        }
        let newWidth = e.clientX;
        if (newWidth < minWidth) {
            return;
        }
        sidebarEl.style.width = `${newWidth}px`;
    }

    function stopResize(e) {
        isResizing = false;
        window.removeEventListener('mousemove', handleMouseMove);
    }

    const queryEl = document.getElementById("query");
    const searchEl = document.getElementById('search');
    searchEl.addEventListener('click', async () => {
        const pages = await searchPages(queryEl.value);

        const containerEl = document.createElement('div');
        containerEl.className = 'search-results';

        if (pages.length === 0) {
            containerEl.textContent = 'Nothing found.';
        } else {
            for (const page of pages) {
                const a = document.createElement('a');
                a.href = `#${page}`;
                a.textContent = page;
                containerEl.appendChild(a);
            }
        }
        displayModalDialog({
            title: 'Search',
            messageEl: containerEl,
            buttons: [
                {
                    classList: ['modal-button-cancel'],
                    isCancel: true,
                    caption: 'Close'
                }
            ]
        });
    });

    queryEl.addEventListener('keydown', (event) => {
        if (event.key !== "Enter") {
            return;
        }
        searchEl.click();
    });
}

function updateSidebarNavigationTreeSelection() {
    const currentRoute = decodeURIComponent(window.location.hash.slice(1));
    const parts = currentRoute.split('/').filter(Boolean);
    if (parts.length === 0) {
        return;
    }

    const sidebarNavigationEl = document.getElementById('sidebar-navigation');
    let currentPath = '';
    let summaryEl = null;

    for (const part of parts) {
        currentPath += `/${part}`;
        summaryEl = sidebarNavigationEl.querySelector(`summary[data-page-path='${currentPath}']`);
        if (summaryEl) {
            const detailsEl = summaryEl.parentElement;
            if (!detailsEl.open) {
                detailsEl.open = true;
            }
        }
    }

    const selectedElements = sidebarNavigationEl.querySelectorAll('.selected');
    selectedElements.forEach(el => {
        if (el !== summaryEl) {
            el.classList.remove('selected');
        }
    });

    if (summaryEl) {
        summaryEl.classList.add('selected');
    }
}

function displayModalDialog({ title = '', message = '', messageEl = null, withInput = false, inputValue = '', classList = [], buttons = [] }) {
    const modalEl = document.createElement('div');
    modalEl.classList.add('modal-overlay', ...classList);
    modalEl.addEventListener('click', () => modalEl.remove());

    const contentEl = document.createElement('div');
    contentEl.className = 'modal-content';
    contentEl.addEventListener('click', (ev) => ev.stopPropagation());
    modalEl.appendChild(contentEl);

    if (title) {
        const titleEl = document.createElement('p');
        titleEl.className = 'modal-title';
        titleEl.textContent = title;
        contentEl.appendChild(titleEl);
    }

    if (message) {
        const messageEl = document.createElement('p');
        messageEl.className = 'modal-message';
        messageEl.innerHTML = message;
        contentEl.appendChild(messageEl);
    }

    if (messageEl) {
        contentEl.appendChild(messageEl);
    }

    let inputEl = null;
    if (withInput) {
        inputEl = document.createElement('input');
        inputEl.className = 'modal-input';
        if (inputValue) {
            inputEl.value = inputValue;
        }
        contentEl.appendChild(inputEl);
    }

    let errorEl = document.createElement('p');
    errorEl.className = 'modal-error';

    if (inputEl) {
        inputEl.addEventListener('input', () => {
            errorEl.textContent = '';
        });
    }

    contentEl.appendChild(errorEl);

    const containerEl = document.createElement('div');
    containerEl.className = 'modal-button-container';
    contentEl.appendChild(containerEl);

    const cleanupFn = [];

    for (const { caption = '', callbackFn, validateFn, classList = [], isDefault = false, isCancel = false } of buttons) {
        const buttonEl = document.createElement('button');
        buttonEl.className = 'modal-button';
        buttonEl.textContent = caption;
        if (isDefault && inputEl) {
            inputEl.addEventListener('keydown', (event) => {
                if (event.key !== "Enter") {
                    return;
                }
                buttonEl.click();
            });
        }
        if (isCancel) {
            function escape(ev) {
                if (ev.key !== "Escape") {
                    return;
                }
                buttonEl.click();
            }
            document.addEventListener('keydown', escape);
            cleanupFn.push(() => document.removeEventListener('keydown', escape));
        }
        if (classList) {
            buttonEl.classList.add(...classList);
        }
        buttonEl.addEventListener('click', async () => {
            const value = inputEl ? inputEl.value : null;
            if (validateFn) {
                const errorMessage = validateFn(value);
                if (errorMessage) {
                    errorEl.textContent = errorMessage;
                    return;
                }
            }
            cleanupFn.forEach(fn => fn());
            modalEl.remove();
            if (callbackFn) {
                await callbackFn(value);
            }
        });
        containerEl.appendChild(buttonEl);
    }

    function onHashChange() {
        cleanupFn.forEach(fn => fn());
        modalEl.remove();
        window.removeEventListener('hashchange', onHashChange);
    }

    window.addEventListener('hashchange', onHashChange);

    document.body.appendChild(modalEl);

    if (inputEl) {
        inputEl.focus();
    }
}

function setupEditorInteractions() {
    const editorEl = document.getElementById('html-content-editor');
    editorEl.addEventListener('click', (ev) => {
        const target = ev.target;
        if (target.tagName !== 'A') {
            return;
        }
        const href = target.getAttribute('href');
        if (href.startsWith("#/")) {
            window.location.hash = href.substring(1);
            return;
        }
        window.open(href, '_blank').focus();
        ev.preventDefault();
    });

    const markerEl = document.getElementById('ql-marker');
    markerEl.addEventListener('click', async () => {
        const range = quill.getSelection();
        if (!range || range.length == 0) {
            return;
        }
        const format = quill.getFormat(range);
        if (format.background === "") {
            quill.formatText(range.index, range.length, 'background', 'yellow');
            return;
        }
        quill.formatText(range.index, range.length, 'background', false);
    });

    document.addEventListener('click', (ev) => {
        // Close all open menu details elements when clicking outside of them (do not mix with sidebar navigation)
        if (ev.target.tagName === 'SUMMARY' &&
            ev.target.parentElement.classList.contains("menu") &&
            ev.target.parentElement.hasAttribute('open')) {
            ev.target.parentElement.removeAttribute('open');
            ev.preventDefault();
            return;
        }
        const openedElements = document.querySelectorAll('details[open].menu');
        openedElements.forEach(el => el.removeAttribute('open'));
    });

    const newEl = document.getElementById('new');
    newEl.addEventListener('click', async () => {
        const currentRoute = decodeURIComponent(window.location.hash.slice(1));
        displayModalDialog({
            title: 'New Page',
            withInput: true,
            inputValue: `${currentRoute}/`,
            buttons: [
                {
                    classList: ['modal-button-cancel'],
                    isCancel: true,
                    caption: 'Cancel'
                },
                {
                    classList: ['modal-button-action'],
                    caption: 'Create',
                    isDefault: true,
                    callbackFn: async (page) => {
                        await createPage(page);
                        await loadSidebarNavigationTree();
                        window.location.hash = page;
                    },
                    validateFn: (page) => {
                        page = page.trim();
                        if (!page) {
                            return 'You need to specify the path to the page.';
                        }
                        if (!page.startsWith('/')) {
                            return 'The path to the page must start with a slash (/).';
                        }
                        if (page.endsWith('/')) {
                            return 'The path to the page must not end with a slash (/).';
                        }
                        return null;
                    }
                }
            ]
        });

    });

    const deleteEl = document.getElementById('delete');
    deleteEl.addEventListener('click', async () => {
        const currentRoute = decodeURIComponent(window.location.hash.slice(1));
        displayModalDialog({
            title: 'Delete Page',
            message: `Are you sure you want to delete <strong>${currentRoute}</strong>?`,
            classList: ['modal-danger'],
            buttons: [
                {
                    classList: ['modal-button-cancel'],
                    isCancel: true,
                    caption: 'Cancel'
                },
                {
                    classList: ['modal-button-danger'],
                    caption: 'Delete',
                    callbackFn: async () => {
                        await deletePage(currentRoute);
                        await loadSidebarNavigationTree();
                        removeHistoryLink(currentRoute);
                        window.location.hash = '';
                    }
                }
            ]
        });

    });

    const moveEl = document.getElementById('move');
    moveEl.addEventListener('click', async () => {
        const currentRoute = decodeURIComponent(window.location.hash.slice(1));
        displayModalDialog({
            title: 'Move Page',
            message: `Enter a new path for <strong>${currentRoute}</strong>:`,
            withInput: true,
            inputValue: `${currentRoute}/`,
            buttons: [
                {
                    classList: ['modal-button-cancel'],
                    isCancel: true,
                    caption: 'Cancel'
                },
                {
                    classList: ['modal-button-action'],
                    caption: 'Move',
                    isDefault: true,
                    callbackFn: async (newPath) => {
                        await renamePage(currentRoute, newPath);
                        await loadSidebarNavigationTree();
                        removeHistoryLink(currentRoute);
                        window.location.hash = newPath;
                    },
                    validateFn: (newPath) => {
                        newPath = newPath.trim();
                        if (!newPath) {
                            return 'You need to specify the path to the page.';
                        }
                        if (!newPath.startsWith('/')) {
                            return 'The path to the page must start with a slash (/).';
                        }
                        if (newPath.endsWith('/')) {
                            return 'The path to the page must not end with a slash (/).';
                        }
                        if (newPath === currentRoute) {
                            return 'The path to the page must be different from the current path.';
                        }
                        return null;
                    }
                }
            ]
        });
    });
}

async function waitForServiceWorker(interval = 100) {
    return new Promise((resolve) => {
        function check() {
            if (navigator.serviceWorker.controller) {
                resolve();
                return;
            }
            setTimeout(check, interval);
        }
        check();
    });
}

async function sendMessageToServiceWorker(message) {
    await waitForServiceWorker();
    const messageChannel = new MessageChannel();

    return new Promise((resolve, reject) => {
        messageChannel.port1.onmessage = (ev) => {
            if (ev.data.error) {
                reject(new Error(ev.data.error));
                return;
            }
            resolve(ev.data);
        };
        navigator.serviceWorker.controller.postMessage(
            message,
            [messageChannel.port2]
        );
    });
}

async function syncPendingChanges() {
    try {
        await saveEditorChange();
        await sendMessageToServiceWorker({
            type: 'sync'
        });
    } catch (error) {
        displayErrorPopup(error);
    }
}

async function saveEditorChange() {
    if (!currentChange || currentChange.delta.length() === 0) {
        return;
    }
    try {
        // Save the current change and reset the change object for the next change
        // to not lose any changes while the current change is being processed.
        const { page, delta, version } = currentChange;

        currentChange.delta = new Delta();
        currentChange.version += 1;

        await sendMessageToServiceWorker({
            type: 'change',
            change: {
                page: page,
                ops: delta.ops,
                version: version
            }
        });
    } catch (error) {
        displayErrorPopup(error);
    }
}

async function setupEditorChangeTracking() {
    async function periodicallySaveChanges() {
        try {
            await saveEditorChange();
        } finally {
            setTimeout(periodicallySaveChanges, AUTO_SAVE_INTERVAL);
        }
    }

    await waitForServiceWorker();
    periodicallySaveChanges();
}

async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) {
        console.error('Service workers are not supported in this browser.');
        return;
    }
    try {
        await navigator.serviceWorker.register('sw.js', { scope: '/' });
        await waitForServiceWorker();
        navigator.serviceWorker.addEventListener('message', (ev) => {
            const type = ev.data.type;
            switch (type) {
                case 'status':
                    const { pendingChanges } = ev.data.status;
                    if (pendingChanges === 0) {
                        document.getElementById('pending-changes').textContent = '';
                        break;
                    }
                    document.getElementById('pending-changes').textContent = pendingChanges;
                    break;
                default:
                    console.error(`Unknown message type: ${type}`);
            }
        });
    } catch (error) {
        console.error(`Service Worker registration failed: ${error}`);
    }
}

async function setupJournal() {
    const journal = "Journal";
    const currentRoute = decodeURIComponent(window.location.hash.slice(1));
    if (currentRoute !== `/${journal}`) {
        return false;
    }
    const today = new Date().toLocaleDateString('en-US',
        { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' });
    const page = `/${journal}/${today}`;
    const treeData = await getPages();
    if (!treeData[journal][today]) {
        await createPage(page);
        await loadSidebarNavigationTree();
    }
    window.location.hash = page;
    return true;
}

async function setupEventListeners() {
    setupSidebarInteractions();
    await setupEditorChangeTracking();
    setupEditorInteractions();
    window.addEventListener('hashchange', async () => {
        if (await setupJournal()) {
            return;
        }
        await loadEditorContent();
        updateSidebarNavigationTreeSelection();
        addHistoryLink();
        updateHistoryLinks();
    });
    window.addEventListener('beforeunload', async () => {
        if (currentChange && currentChange.delta.length() > 0) {
            await saveEditorChange();
        }
    });
}

window.addEventListener('load', async () => {
    await registerServiceWorker();
    await loadSidebarNavigationTree();
    await setupEventListeners();
    await loadEditorContent();
    addHistoryLink();
    updateHistoryLinks();
});
