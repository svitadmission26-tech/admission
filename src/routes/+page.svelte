<script lang="ts">
	import { onMount } from 'svelte';
	import {
		ArrowDownToLine,
		ArrowLeft,
		Check,
		ChevronDown,
		CircleHelp,
		ClipboardList,
		Eye,
		FilePlus2,
		FileText,
		GripVertical,
		LayoutTemplate,
		LogOut,
		Plus,
		Settings2,
		Sparkles,
		Trash2,
		X
	} from 'lucide-svelte';
	import {
		createFormRecord,
		createSupabaseClient,
		getSupabaseConfig,
		loadWorkspace,
		publishFormRecord,
		saveFormRecord,
		submitEntry,
		unpublishFormRecord,
		type Field,
		type FieldKind,
		type Form
	} from '../lib/supabase';
	import type { User } from '@supabase/supabase-js';
	type View = 'builder' | 'entries';

	const starterFields: Field[] = [
		{ id: 'full-name', label: 'Full name', kind: 'text', required: true, placeholder: 'e.g. Jordan Lee', help: '', options: [] },
		{ id: 'email-address', label: 'Email address', kind: 'email', required: true, placeholder: 'you@example.com', help: 'We will send application updates to this address.', options: [] },
		{ id: 'course', label: 'Program of interest', kind: 'select', required: true, placeholder: 'Select a program', help: '', options: ['Bachelor of Arts', 'Bachelor of Science', 'Master of Business'] },
		{ id: 'start-date', label: 'Preferred start date', kind: 'date', required: false, placeholder: '', help: '', options: [] }
	];
	const kindDetails: { kind: FieldKind; label: string; sample: string }[] = [
		{ kind: 'text', label: 'Short answer', sample: 'Your answer' },
		{ kind: 'textarea', label: 'Long answer', sample: 'Write your answer here' },
		{ kind: 'email', label: 'Email address', sample: 'name@example.com' },
		{ kind: 'phone', label: 'Phone number', sample: '(555) 000-0000' },
		{ kind: 'select', label: 'Dropdown', sample: 'Choose an option' },
		{ kind: 'date', label: 'Date', sample: '' },
		{ kind: 'number', label: 'Number', sample: '0' },
		{ kind: 'checkbox', label: 'Checkbox', sample: '' }
	];

	let forms = $state<Form[]>([]);
	let activeFormId = $state('');
	let workspaceId = $state('');
	let workspaceName = $state('My workspace');
	let supabase = $state<ReturnType<typeof createSupabaseClient>>(null);
	let user = $state<User | null>(null);
	let configReady = $state(false);
	let activeView = $state<View>('builder');
	let selectedFieldId = $state('');
	let previewOpen = $state(false);
	let mobilePanel = $state<'fields' | 'settings' | null>(null);
	let ready = $state(false);
	let saved = $state(true);
	let notice = $state('');
	let dataError = $state('');
	let authError = $state('');
	let authMessage = $state('');
	let authEmail = $state('');
	let authPassword = $state('');
	let authMode = $state<'signin' | 'signup'>('signin');
	let authBusy = $state(false);
	let previewAnswers = $state<Record<string, string>>({});
	let previewChecks = $state<Record<string, boolean>>({});
	let persistTimer: ReturnType<typeof setTimeout> | undefined;

	const activeForm = $derived(forms.find((form) => form.id === activeFormId));
	const selectedField = $derived(activeForm?.fields.find((field) => field.id === selectedFieldId));
	const totalEntries = $derived(forms.reduce((total, form) => total + form.entries.length, 0));
	const formatDate = (value: string) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

	onMount(() => {
		configReady = getSupabaseConfig().configured;
		supabase = createSupabaseClient();
		if (!supabase) {
			ready = true;
			return;
		}

		let mounted = true;
		let loadedUserId = '';
		const client = supabase;
		const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
			if (!mounted) return;
			if (!session) {
				user = null;
				forms = [];
				activeFormId = '';
				workspaceId = '';
				loadedUserId = '';
				ready = true;
				dataError = '';
				return;
			}
			user = session.user;
			if (loadedUserId === session.user.id && ready) return;
			if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
				ready = false;
				loadedUserId = session.user.id;
				window.setTimeout(() => {
					if (mounted) void refreshWorkspace(session.user);
				}, 0);
			}
		});

		return () => {
			mounted = false;
			subscription.unsubscribe();
			if (persistTimer) clearTimeout(persistTimer);
		};
	});

	async function refreshWorkspace(authenticatedUser: User) {
		if (!supabase) return;
		try {
			const data = await loadWorkspace(supabase, authenticatedUser);
			if (user?.id !== authenticatedUser.id) return;
			workspaceId = data.id;
			workspaceName = data.name;
			forms = data.forms;
			if (!forms.length) {
				const form = createStarterForm(data.id);
				await createFormRecord(supabase, authenticatedUser, form);
				forms = [form];
			}
			activeFormId = forms[0]?.id ?? '';
			dataError = '';
		} catch (error) {
			dataError = error instanceof Error ? error.message : 'Could not load workspace data.';
		} finally {
			ready = true;
		}
	}

	function createStarterForm(targetWorkspaceId: string): Form {
		return {
			id: crypto.randomUUID(),
			workspaceId: targetWorkspaceId,
			name: 'Undergraduate application',
			description: 'Tell us a little about yourself and the program you would like to join.',
			status: 'Draft',
			updatedAt: new Date().toISOString(),
			currentVersion: 1,
			publishedVersionId: null,
			fields: structuredClone(starterFields),
			entries: []
		};
	}

	function touchForm() {
		if (!activeForm || !supabase || !user) return;
		if (activeForm.status === 'Published') {
			activeForm.status = 'Draft';
			activeForm.currentVersion += 1;
		}
		activeForm.updatedAt = new Date().toISOString();
		saved = false;
		if (persistTimer) clearTimeout(persistTimer);
		const snapshot = structuredClone(activeForm);
		persistTimer = window.setTimeout(async () => {
			try {
				await saveFormRecord(supabase!, snapshot);
				saved = true;
			} catch (error) {
				saved = false;
				showNotice(error instanceof Error ? `Save failed: ${error.message}` : 'Save failed.');
			}
		}, 500);
	}

	async function newForm() {
		if (!supabase || !user || !workspaceId) return;
		const form = createStarterForm(workspaceId);
		form.name = 'Untitled application';
		form.fields = [];
		try {
			await createFormRecord(supabase, user, form);
		} catch (error) {
			showNotice(error instanceof Error ? `Could not create form: ${error.message}` : 'Could not create form.');
			return;
		}
		forms = [form, ...forms];
		activeFormId = form.id;
		selectedFieldId = '';
		activeView = 'builder';
	}

	function addField(kind: FieldKind) {
		if (!activeForm) return;
		const detail = kindDetails.find((item) => item.kind === kind);
		if (!detail) return;
		const field: Field = {
			id: crypto.randomUUID(),
			label: detail.label,
			kind,
			required: false,
			placeholder: detail.sample,
			help: '',
			options: kind === 'select' ? ['Option 1', 'Option 2'] : []
		};
		activeForm.fields = [...activeForm.fields, field];
		selectedFieldId = field.id;
		touchForm();
	}

	function removeField(fieldId: string) {
		if (!activeForm) return;
		activeForm.fields = activeForm.fields.filter((field) => field.id !== fieldId);
		if (selectedFieldId === fieldId) selectedFieldId = '';
		touchForm();
	}

	function moveField(index: number, direction: -1 | 1) {
		if (!activeForm) return;
		const nextIndex = index + direction;
		if (nextIndex < 0 || nextIndex >= activeForm.fields.length) return;
		const next = [...activeForm.fields];
		[next[index], next[nextIndex]] = [next[nextIndex], next[index]];
		activeForm.fields = next;
		touchForm();
	}

	function updateOptions(value: string) {
		if (selectedField) {
			selectedField.options = value.split('\n').map((option) => option.trim()).filter(Boolean);
			touchForm();
		}
	}

	async function togglePublish() {
		if (!activeForm) return;
		if (!activeForm.fields.length) {
			showNotice('Add at least one field before publishing.');
			return;
		}
		if (!supabase) return;
		try {
			if (activeForm.status === 'Published') {
				await unpublishFormRecord(supabase, activeForm);
				activeForm.status = 'Draft';
				showNotice('Form unpublished.');
			} else {
				activeForm.publishedVersionId = await publishFormRecord(supabase, activeForm);
				activeForm.status = 'Published';
				showNotice('Form published.');
			}
			activeForm.updatedAt = new Date().toISOString();
			saved = true;
		} catch (error) {
			showNotice(error instanceof Error ? `Publish failed: ${error.message}` : 'Publish failed.');
		}
	}

	async function submitPreview(event: SubmitEvent) {
		event.preventDefault();
		if (!activeForm || !supabase || !user) return;
		if (activeForm.status !== 'Published') {
			showNotice('Publish this form before accepting responses.');
			return;
		}
		const data: Record<string, string | boolean> = {};
		for (const field of activeForm.fields) data[field.id] = field.kind === 'checkbox' ? Boolean(previewChecks[field.id]) : previewAnswers[field.id] ?? '';
		try {
			const entry = await submitEntry(supabase, user, activeForm, data);
			activeForm.entries = [entry, ...activeForm.entries];
		} catch (error) {
			showNotice(error instanceof Error ? `Submission failed: ${error.message}` : 'Submission failed.');
			return;
		}
		previewAnswers = {};
		previewChecks = {};
		previewOpen = false;
		activeView = 'entries';
		saved = true;
		showNotice('Test response saved to entries.');
	}

	async function handleAuth(event: SubmitEvent) {
		event.preventDefault();
		if (!supabase) return;
		authBusy = true;
		authError = '';
		authMessage = '';
		try {
			if (authMode === 'signup') {
				const { data, error } = await supabase.auth.signUp({ email: authEmail, password: authPassword });
				if (error) throw error;
				if (!data.session) authMessage = 'Check your email to confirm your account, then sign in.';
			} else {
				const { error } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword });
				if (error) throw error;
			}
		} catch (error) {
			authError = error instanceof Error ? error.message : 'Authentication failed.';
		} finally {
			authBusy = false;
		}
	}

	async function signOut() {
		if (!supabase) return;
		const { error } = await supabase.auth.signOut();
		if (error) showNotice(error.message);
	}

	function exportCsv() {
		if (!activeForm || !activeForm.entries.length) return;
		const fields = activeForm.fields;
		const escape = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
		const rows = [
			['Submitted at', ...fields.map((field) => field.label)],
			...activeForm.entries.map((entry) => [entry.submittedAt, ...fields.map((field) => entry.answers[field.id] ?? '')])
		];
		const csv = rows.map((row) => row.map(escape).join(',')).join('\r\n');
		const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
		const link = document.createElement('a');
		link.href = url;
		link.download = `${activeForm.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-entries.csv`;
		link.click();
		URL.revokeObjectURL(url);
	}

	function showNotice(message: string) {
		notice = message;
		window.setTimeout(() => (notice = ''), 2800);
	}

	function answerLabel(value: string | boolean | undefined) {
		if (typeof value === 'boolean') return value ? 'Yes' : 'No';
		return value || '—';
	}
</script>

<svelte:head>
	<title>Form Studio | Admission</title>
	<meta name="description" content="Design admission forms and manage responses." />
</svelte:head>

<div class="app-shell">
	<aside class="sidebar">
		<a class="brand" href="#top" aria-label="Admission Form Studio home">
			<span class="brand-mark"><LayoutTemplate size={19} strokeWidth={2.2} /></span>
			<span class="brand-name">admission<span> / </span>studio</span>
		</a>
		<div class="workspace-label">WORKSPACE</div>
		<button class="workspace-select"><span class="workspace-avatar">N</span><span>Northfield College</span><ChevronDown size={15} /></button>
		<div class="sidebar-heading"><span>YOUR FORMS</span><button class="icon-button small" onclick={newForm} aria-label="Create a new form" title="Create a new form"><Plus size={16} /></button></div>
		<nav class="form-nav" aria-label="Your forms">
			{#each forms as form (form.id)}
				<button class:active={activeFormId === form.id} class="form-link" onclick={() => { activeFormId = form.id; activeView = 'builder'; selectedFieldId = ''; }}>
					<FileText size={16} /><span class="form-link-copy"><span>{form.name}</span><small>{form.entries.length} {form.entries.length === 1 ? 'response' : 'responses'}</small></span>
				</button>
			{/each}
		</nav>
		<div class="sidebar-spacer"></div>
		<div class="storage-note"><span class="storage-dot"></span><span>Saved in this browser</span><span title="Forms are stored locally in your browser for this prototype."><CircleHelp size={14} /></span></div>
		<div class="profile-row"><div class="profile-avatar">AM</div><div><strong>Alex Morgan</strong><small>Workspace admin</small></div><Settings2 size={17} /></div>
	</aside>

	<main id="top" class="main-area">
		<header class="topbar">
			<div class="breadcrumbs"><span>Forms</span><span class="crumb-slash">/</span><strong>{activeForm?.name ?? 'Form studio'}</strong></div>
			<div class="top-actions">
				<span class="save-status"><span class:unsaved={!saved} class="save-dot"></span>{saved ? 'All changes saved' : 'Saving...'}</span>
				<button class="button button-quiet preview-button" onclick={() => (previewOpen = true)} disabled={!activeForm}><Eye size={16} />Preview</button>
				<button class:published={activeForm?.status === 'Published'} class="button button-publish" onclick={togglePublish} disabled={!activeForm}>
					{#if activeForm?.status === 'Published'}<Check size={16} /> Published{:else}<Sparkles size={15} /> Publish form{/if}
				</button>
			</div>
		</header>

		{#if activeForm}
			<div class="content-wrap">
				<div class="page-heading">
					<div><div class="eyebrow">FORM BUILDER <span class="eyebrow-dot">·</span> <span class:status-live={activeForm.status === 'Published'} class="status-text">{activeForm.status}</span></div>
						<input class="form-title" aria-label="Form name" bind:value={activeForm.name} oninput={touchForm} />
						<p class="page-subtitle">Build a clear, welcoming application experience.</p>
					</div>
					<div class="heading-meta"><span class="meta-label">LAST EDITED</span><span>{formatDate(activeForm.updatedAt)}</span><span class="meta-divider"></span><span class="meta-label">RESPONSES</span><strong>{activeForm.entries.length}</strong></div>
				</div>

				<div class="workspace-tabs">
					<button class:tab-active={activeView === 'builder'} onclick={() => (activeView = 'builder')}><LayoutTemplate size={15} />Builder</button>
					<button class:tab-active={activeView === 'entries'} onclick={() => (activeView = 'entries')}><ClipboardList size={15} />Entries<span class="tab-count">{activeForm.entries.length}</span></button>
					<div class="tab-spacer"></div>
					<span class="autosave-label"><span class="save-dot"></span>Autosaved</span>
				</div>

				{#if activeView === 'builder'}
					<div class="builder-grid">
						<aside class:mobile-open={mobilePanel === 'fields'} class="panel field-panel">
							<div class="panel-title"><div><span class="panel-kicker">BUILD</span><h2>Add a field</h2></div><button class="mobile-close icon-button" onclick={() => (mobilePanel = null)} aria-label="Close field panel"><X size={17} /></button></div>
							<p class="panel-hint">Choose a question type to add it to your form.</p>
							<div class="field-palette">
								{#each kindDetails as detail}
									<button class="palette-item" onclick={() => addField(detail.kind)}><span class="palette-icon"><Plus size={15} /></span><span>{detail.label}</span></button>
								{/each}
							</div>
							<div class="field-panel-foot"><span class="tiny-star">✳</span><span>Good forms ask one thing at a time.</span></div>
						</aside>

						<section class="canvas-column" aria-label="Form canvas">
							<div class="canvas-toolbar"><div class="canvas-label"><span class="canvas-indicator"></span>APPLICATION FORM <span class="canvas-separator">/</span> <span>{activeForm.fields.length} FIELDS</span></div><button class="canvas-preview" onclick={() => (previewOpen = true)}><Eye size={14} />Quick preview</button></div>
							<div class="form-canvas">
								<div class="form-cover"><div class="cover-overline"><span class="cover-line"></span> NORTHFIELD COLLEGE <span class="cover-line"></span></div>
									<input class="cover-title" aria-label="Application title" bind:value={activeForm.name} oninput={touchForm} />
									<textarea class="cover-description" aria-label="Form description" bind:value={activeForm.description} oninput={touchForm} rows="2"></textarea>
								</div>
								<div class="fields-list">
									{#each activeForm.fields as field, index (field.id)}
										<div class:selected={selectedFieldId === field.id} class="field-card" role="button" tabindex="0" aria-label={`Edit ${field.label}`} onclick={() => (selectedFieldId = field.id)} onkeydown={(event) => { if (event.key === 'Enter' || event.key === ' ') selectedFieldId = field.id; }}>
											<div class="field-card-top"><div class="field-card-type"><GripVertical size={15} /><span>{kindDetails.find((item) => item.kind === field.kind)?.label ?? field.kind}</span></div><div class="field-actions"><button class="icon-button small" onclick={(event) => { event.stopPropagation(); moveField(index, -1); }} aria-label="Move field up" title="Move up" disabled={index === 0}><ArrowLeft size={14} class="move-up-icon" /></button><button class="icon-button small" onclick={(event) => { event.stopPropagation(); moveField(index, 1); }} aria-label="Move field down" title="Move down"><ArrowLeft size={14} class="move-down-icon" /></button><button class="icon-button small danger-hover" onclick={(event) => { event.stopPropagation(); removeField(field.id); }} aria-label="Delete field" title="Delete field"><Trash2 size={14} /></button></div></div>
											<div class="field-label">{field.label || 'Untitled question'}{#if field.required}<span class="required-star">*</span>{/if}</div>
											{#if field.help}<div class="field-help-preview">{field.help}</div>{/if}
											{#if field.kind === 'textarea'}<div class="fake-input fake-textarea">{field.placeholder || 'Write your answer here'}</div>
											{:else if field.kind === 'select'}<div class="fake-input fake-select">{field.placeholder || 'Choose an option'}<ChevronDown size={15} /></div>
											{:else if field.kind === 'checkbox'}<div class="fake-checkbox"><span></span>{field.placeholder || 'Option label'}</div>
											{:else}<div class="fake-input">{field.placeholder || (field.kind === 'date' ? 'MM / DD / YYYY' : 'Your answer')}</div>{/if}
										</div>
									{:else}
										<div class="empty-canvas"><div class="empty-glyph"><FilePlus2 size={24} /></div><h3>Your form starts here</h3><p>Add a question from the left to begin building your application.</p><button class="button button-quiet" onclick={() => addField('text')}><Plus size={15} />Add your first field</button></div>
									{/each}
								</div>
								<div class="canvas-endnote"><span>FORM END</span><span class="endnote-line"></span><span>Thank you for applying</span></div>
							</div>
							<div class="canvas-footer"><span>Changes are saved automatically to this browser.</span><span>Desktop preview <span class="footer-dot">·</span> Mobile ready</span></div>
						</section>

						<aside class:mobile-open={mobilePanel === 'settings'} class="panel settings-panel">
							{#if selectedField}
								<div class="panel-title"><div><span class="panel-kicker">FIELD SETTINGS</span><h2>Question</h2></div><button class="mobile-close icon-button" onclick={() => (mobilePanel = null)} aria-label="Close settings"><X size={17} /></button></div>
								<div class="settings-form">
									<label class="control-label">Question label<input class="text-control" bind:value={selectedField.label} oninput={touchForm} placeholder="e.g. Full name" /></label>
									<label class="control-label">Question type<select class="text-control" bind:value={selectedField.kind} onchange={touchForm}>{#each kindDetails as detail}<option value={detail.kind}>{detail.label}</option>{/each}</select></label>
									<label class="control-label">Placeholder<input class="text-control" bind:value={selectedField.placeholder} oninput={touchForm} placeholder="Shown inside the field" /></label>
									{#if selectedField.kind === 'select'}<label class="control-label">Options <span class="label-note">one per line</span><textarea class="text-control option-control" value={selectedField.options.join('\n')} oninput={(event) => updateOptions(event.currentTarget.value)} rows="4"></textarea></label>{/if}
									<label class="control-label">Help text <span class="label-note">optional</span><textarea class="text-control help-control" bind:value={selectedField.help} oninput={touchForm} rows="3" placeholder="Add a helpful hint for applicants"></textarea></label>
									<div class="setting-divider"></div>
									<label class="toggle-row"><span><strong>Required</strong><small>Applicants must answer this question</small></span><input type="checkbox" bind:checked={selectedField.required} onchange={touchForm} /><span class="toggle-track"></span></label>
								</div>
							{:else}
								<div class="panel-title"><div><span class="panel-kicker">FORM SETTINGS</span><h2>Details</h2></div><button class="mobile-close icon-button" onclick={() => (mobilePanel = null)} aria-label="Close settings"><X size={17} /></button></div>
								<div class="settings-form">
									<label class="control-label">Form name<input class="text-control" bind:value={activeForm.name} oninput={touchForm} /></label>
									<label class="control-label">Description<textarea class="text-control help-control" bind:value={activeForm.description} oninput={touchForm} rows="4"></textarea></label>
									<div class="setting-divider"></div>
									<div class="settings-summary"><span class="summary-icon"><ClipboardList size={16} /></span><span><strong>{activeForm.fields.length} questions</strong><small>in this application</small></span></div>
									<div class="settings-summary"><span class="summary-icon"><Check size={16} /></span><span><strong>{activeForm.entries.length} responses</strong><small>collected so far</small></span></div>
									<div class="tip-block"><Sparkles size={15} /><p>Keep your application focused. Short forms are easier to complete.</p></div>
								</div>
							{/if}
						</aside>
					</div>
				{:else}
					<section class="entries-view">
						<div class="entries-toolbar"><div><h2>Application responses</h2><p>Review the information submitted through this form.</p></div><button class="button button-quiet" onclick={exportCsv} disabled={!activeForm.entries.length}><ArrowDownToLine size={16} />Export CSV</button></div>
						{#if activeForm.entries.length}
							<div class="table-wrap"><table><thead><tr><th>SUBMITTED</th>{#each activeForm.fields as field}<th>{field.label.toUpperCase()}</th>{/each}</tr></thead><tbody>{#each activeForm.entries as entry (entry.id)}<tr><td>{formatDate(entry.submittedAt)}</td>{#each activeForm.fields as field}<td>{answerLabel(entry.answers[field.id])}</td>{/each}</tr>{/each}</tbody></table></div>
						{:else}
							<div class="entries-empty"><div class="empty-glyph"><ClipboardList size={23} /></div><h3>No responses yet</h3><p>Preview your form and submit a test response to see it here.</p><button class="button button-primary" onclick={() => (previewOpen = true)}><Eye size={15} />Preview form</button></div>
						{/if}
					</section>
				{/if}
			</div>
		{:else}
			<div class="loading-state">Loading your forms...</div>
		{/if}
	</main>
</div>

<nav class="mobile-tabs" aria-label="Mobile builder panels"><button class:mobile-tab-active={mobilePanel === 'fields'} onclick={() => (mobilePanel = mobilePanel === 'fields' ? null : 'fields')}><Plus size={17} />Fields</button><button class:mobile-tab-active={mobilePanel === 'settings'} onclick={() => (mobilePanel = mobilePanel === 'settings' ? null : 'settings')}><Settings2 size={17} />Settings</button></nav>

{#if previewOpen && activeForm}
	<div class="modal-backdrop" role="presentation" onclick={(event) => { if (event.target === event.currentTarget) previewOpen = false; }}>
		<dialog open class="preview-modal" aria-labelledby="preview-title">
			<header class="preview-header"><div><div class="preview-kicker"><Eye size={14} /> LIVE PREVIEW</div><h2 id="preview-title">How it looks to applicants</h2></div><button class="icon-button" onclick={() => (previewOpen = false)} aria-label="Close preview"><X size={19} /></button></header>
			<div class="preview-scroll"><div class="preview-form-head"><span class="cover-overline"><span class="cover-line"></span> NORTHFIELD COLLEGE <span class="cover-line"></span></span><h1>{activeForm.name}</h1><p>{activeForm.description}</p></div>
				{#if activeForm.fields.length}
					<form onsubmit={submitPreview} class="preview-fields">{#each activeForm.fields as field (field.id)}<label class="preview-field"><span class="preview-label">{field.label}{#if field.required}<span class="required-star"> *</span>{/if}</span>{#if field.help}<span class="preview-help">{field.help}</span>{/if}{#if field.kind === 'select'}<select required={field.required} bind:value={previewAnswers[field.id]}><option value="">{field.placeholder || 'Choose an option'}</option>{#each field.options as option}<option value={option}>{option}</option>{/each}</select>{:else if field.kind === 'textarea'}<textarea required={field.required} placeholder={field.placeholder} bind:value={previewAnswers[field.id]} rows="3"></textarea>{:else if field.kind === 'checkbox'}<span class="preview-check"><input type="checkbox" bind:checked={previewChecks[field.id]} />{field.placeholder || 'Yes'}</span>{:else}<input type={field.kind === 'phone' ? 'tel' : field.kind} required={field.required} placeholder={field.placeholder} bind:value={previewAnswers[field.id]} />{/if}</label>{/each}<button class="button button-primary preview-submit" type="submit">Submit application <ArrowLeft size={15} class="submit-arrow" /></button><p class="preview-privacy">Your information will only be used to process your application.</p></form>
				{:else}<div class="preview-no-fields">Add questions to this form before previewing a response.</div>{/if}
			</div>
		</dialog>
	</div>
{/if}

{#if notice}<div class="toast" role="status"><Check size={16} />{notice}</div>{/if}

<style>
	.app-shell { min-height: 100vh; display: grid; grid-template-columns: 244px minmax(0, 1fr); }
	.sidebar { background: #fbfcf9; border-right: 1px solid var(--line); padding: 23px 15px 15px; display: flex; flex-direction: column; min-height: 100vh; position: sticky; top: 0; height: 100vh; }
	.brand { display: flex; align-items: center; gap: 10px; padding: 1px 9px 31px; color: var(--ink); text-decoration: none; }
	.brand-mark { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 8px; background: #276b51; color: #fff; }
	.brand-name { font: 800 15px 'Manrope', sans-serif; letter-spacing: 0; }
	.brand-name span { color: #adbbb0; font-family: 'DM Mono', monospace; font-weight: 400; }
	.workspace-label, .sidebar-heading, .panel-kicker, .meta-label, .eyebrow, .canvas-label, .cover-overline, .entries-view th, .preview-kicker { font-family: var(--mono); font-size: 10px; font-weight: 500; letter-spacing: 0; color: #879087; }
	.workspace-label { padding: 0 10px 9px; }
	.workspace-select { border: 1px solid var(--line); border-radius: 7px; background: #fff; min-height: 42px; padding: 5px 9px; display: flex; align-items: center; gap: 9px; width: 100%; font-size: 12px; text-align: left; }
	.workspace-select :global(svg) { margin-left: auto; color: #889189; }
	.workspace-avatar { width: 23px; height: 23px; border-radius: 5px; background: #e6eee4; color: #426c4d; display: grid; place-items: center; font: 600 12px 'Manrope', sans-serif; }
	.sidebar-heading { display: flex; justify-content: space-between; align-items: center; padding: 34px 8px 10px; }
	.form-nav { display: grid; gap: 3px; }
	.form-link { border: 0; padding: 9px 8px; border-radius: 6px; background: transparent; display: flex; align-items: flex-start; gap: 9px; text-align: left; cursor: pointer; color: #788078; min-width: 0; }
	.form-link :global(svg) { flex: none; margin-top: 2px; }
	.form-link.active { background: #edf3ed; color: #28684d; }
	.form-link-copy { display: grid; gap: 4px; min-width: 0; }
	.form-link-copy > span { color: #303932; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.form-link-copy small { font-size: 10px; color: #909890; }
	.sidebar-spacer { flex: 1; }
	.storage-note { display: flex; align-items: center; gap: 8px; padding: 12px 8px; margin-bottom: 12px; border-bottom: 1px solid var(--line); color: #788078; font-size: 10px; }
	.storage-note > span:last-child { margin-left: auto; color: #a4aaa4; }
	.storage-dot { width: 7px; height: 7px; background: #54a276; border-radius: 50%; }
	.profile-row { display: flex; align-items: center; gap: 9px; padding: 4px 8px 3px; }
	.profile-avatar { width: 31px; height: 31px; display: grid; place-items: center; background: #f1ded1; border-radius: 50%; color: #895d41; font: 600 10px 'Manrope', sans-serif; }
	.profile-row > div:nth-child(2) { display: grid; gap: 3px; }
	.profile-row strong { font-size: 11px; font-weight: 600; }
	.profile-row small { color: var(--muted); font-size: 10px; }
	.profile-row :global(svg) { margin-left: auto; color: #828b82; }
	.main-area { min-width: 0; }
	.topbar { height: 61px; display: flex; align-items: center; justify-content: space-between; padding: 0 34px; background: rgba(255,255,255,.77); border-bottom: 1px solid var(--line); }
	.breadcrumbs { display: flex; align-items: center; gap: 10px; color: #838a83; font-size: 12px; }
	.breadcrumbs strong { color: #303831; font-weight: 600; }
	.crumb-slash { color: #c1c7c0; }
	.top-actions { display: flex; align-items: center; gap: 9px; }
	.save-status { display: flex; align-items: center; gap: 7px; margin-right: 8px; color: #798179; font-size: 10px; }
	.save-dot { width: 6px; height: 6px; border-radius: 50%; background: #50a06f; display: inline-block; }
	.save-dot.unsaved { background: #d19a54; }
	.button { display: inline-flex; align-items: center; justify-content: center; gap: 7px; border-radius: 6px; cursor: pointer; min-height: 34px; padding: 0 12px; font-size: 11px; font-weight: 600; transition: background .15s, border-color .15s; }
	.button:disabled { opacity: .5; cursor: not-allowed; }
	.button-quiet { background: #fff; border: 1px solid #dfe4dd; }
	.button-quiet:hover:not(:disabled) { background: #f7f9f5; border-color: #cbd3ca; }
	.button-publish { background: #246a4d; border: 1px solid #246a4d; color: #fff; }
	.button-publish:hover:not(:disabled) { background: #1b5a40; }
	.button-publish.published { background: #e8f2ec; border-color: #c8dfd0; color: #27684d; }
	.button-primary { background: #286d50; color: #fff; border: 1px solid #286d50; }
	.content-wrap { max-width: 1600px; margin: 0 auto; padding: 34px 34px 50px; }
	.page-heading { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 25px; }
	.eyebrow { color: #818a81; display: flex; align-items: center; gap: 8px; margin-bottom: 7px; }
	.eyebrow-dot { color: #b9c0b9; }
	.status-text { color: #aa8151; }
	.status-text.status-live { color: #40805c; }
	.form-title { display: block; width: min(550px, 60vw); border: 0; padding: 0; outline: 0; background: transparent; color: #242c26; font: 700 27px 'Manrope', sans-serif; }
	.form-title:focus { outline: 0; }
	.page-subtitle { margin: 6px 0 0; color: #7b837c; font-size: 12px; }
	.heading-meta { display: flex; align-items: center; gap: 9px; padding-bottom: 2px; color: #5c665d; font-size: 10px; }
	.heading-meta strong { font: 500 11px var(--mono); }
	.meta-label { font-size: 9px; }
	.meta-divider { height: 14px; width: 1px; background: var(--line); margin: 0 5px; }
	.workspace-tabs { height: 43px; display: flex; gap: 24px; border-bottom: 1px solid #dfe4dd; align-items: stretch; }
	.workspace-tabs > button { display: flex; gap: 7px; align-items: center; border: 0; border-bottom: 2px solid transparent; background: transparent; color: #808880; padding: 0 2px; font-size: 11px; cursor: pointer; }
	.workspace-tabs > button.tab-active { border-bottom-color: #2c7354; color: #27684d; font-weight: 600; }
	.tab-count { background: #eef1ed; border-radius: 10px; min-width: 17px; padding: 2px 5px; text-align: center; font: 10px var(--mono); color: #626d64; }
	.tab-spacer { flex: 1; }
	.autosave-label { align-self: center; color: #838b84; font-size: 10px; display: flex; gap: 6px; align-items: center; }
	.builder-grid { display: grid; grid-template-columns: minmax(175px, 210px) minmax(340px, 1fr) minmax(205px, 246px); gap: 17px; padding-top: 20px; align-items: start; }
	.panel { background: #fff; border: 1px solid var(--line); border-radius: 7px; min-width: 0; }
	.field-panel, .settings-panel { padding: 16px 14px; min-height: 300px; }
	.panel-title { display: flex; justify-content: space-between; align-items: center; }
	.panel-kicker { font-size: 9px; }
	.panel-title h2 { margin: 5px 0 0; font: 700 14px 'Manrope', sans-serif; }
	.panel-hint { margin: 9px 0 15px; color: #838b84; font-size: 10px; line-height: 1.55; }
	.field-palette { display: grid; gap: 5px; }
	.palette-item { display: flex; align-items: center; gap: 9px; min-height: 34px; padding: 4px 7px; border: 1px solid transparent; border-radius: 5px; background: transparent; color: #454e46; text-align: left; font-size: 10px; cursor: pointer; }
	.palette-item:hover { background: #f4f7f2; border-color: #e6ebe4; }
	.palette-icon { display: grid; place-items: center; width: 21px; height: 21px; border-radius: 5px; background: #f0f4ef; color: #588064; }
	.field-panel-foot { margin-top: 24px; border-top: 1px solid #edf0eb; padding: 12px 2px 0; display: flex; gap: 8px; align-items: flex-start; color: #879087; font-size: 9px; line-height: 1.5; }
	.tiny-star { color: #c27c51; font-size: 13px; }
	.canvas-column { min-width: 0; }
	.canvas-toolbar { height: 32px; display: flex; justify-content: space-between; align-items: center; padding: 0 2px 10px; }
	.canvas-label { display: flex; align-items: center; gap: 7px; color: #778178; font-size: 9px; }
	.canvas-indicator { display: inline-block; width: 7px; height: 7px; border-radius: 2px; background: #64a678; }
	.canvas-label > span:last-child { color: #9ba29b; }
	.canvas-separator { color: #c5cbc4; }
	.canvas-preview { display: flex; align-items: center; gap: 5px; border: 0; padding: 4px 5px; color: #667267; background: transparent; font-size: 10px; cursor: pointer; }
	.canvas-preview:hover { color: #236b50; }
	.form-canvas { background: #eaede7; border: 1px solid #e1e5df; border-radius: 7px; padding: 19px clamp(14px, 4vw, 38px) 18px; min-height: 520px; }
	.form-cover { background: #fff; border: 1px solid #e5e9e3; border-top: 3px solid #468261; border-radius: 5px; padding: 22px 23px 19px; margin-bottom: 10px; }
	.cover-overline { display: flex; align-items: center; gap: 9px; color: #788379; font-size: 8px; letter-spacing: 0; }
	.cover-line { width: 16px; height: 1px; background: #aab6aa; }
	.cover-title { display: block; margin: 14px 0 5px; width: 100%; padding: 0; border: 0; outline: 0; color: #29322b; background: transparent; font: 700 20px 'Manrope', sans-serif; }
	.cover-title:focus { outline: 0; }
	.cover-description { display: block; width: 100%; resize: vertical; border: 0; outline: 0; padding: 0; color: #7c847d; background: transparent; font-size: 10px; line-height: 1.6; }
	.cover-description:focus { outline: 0; }
	.fields-list { display: grid; gap: 9px; }
	.field-card { background: #fff; border: 1px solid #e3e8e1; border-radius: 5px; padding: 11px 13px 14px; cursor: pointer; transition: border-color .12s, box-shadow .12s; }
	.field-card:hover { border-color: #c6d7c8; }
	.field-card.selected { border-color: #6a9c78; box-shadow: 0 0 0 1px #6a9c78; }
	.field-card-top { min-height: 20px; display: flex; justify-content: space-between; align-items: center; }
	.field-card-type { display: flex; align-items: center; gap: 6px; color: #a0a8a0; font-size: 9px; }
	.field-actions { display: flex; gap: 1px; opacity: 0; transition: opacity .12s; }
	.field-card:hover .field-actions, .field-card.selected .field-actions, .field-actions:focus-within { opacity: 1; }
	.icon-button { display: inline-grid; place-items: center; width: 30px; height: 30px; border: 1px solid transparent; border-radius: 5px; background: transparent; color: #7f897f; cursor: pointer; }
	.icon-button:hover { background: #f0f4ef; color: #28684d; }
	.icon-button:disabled { opacity: .35; cursor: not-allowed; }
	.icon-button.small { width: 24px; height: 24px; }
	.danger-hover:hover { color: #b95546; background: #fbefed; }
	:global(.move-up-icon) { transform: rotate(90deg); }
	:global(.move-down-icon) { transform: rotate(-90deg); }
	.field-label { margin: 8px 0 9px; color: #303831; font-size: 11px; font-weight: 600; }
	.required-star { color: #c85e4d; }
	.field-help-preview { margin: -4px 0 8px; color: #848d85; font-size: 9px; }
	.fake-input { height: 34px; display: flex; align-items: center; justify-content: space-between; padding: 0 10px; border: 1px solid #e5e9e4; border-radius: 4px; color: #a4aaa4; font-size: 10px; }
	.fake-select :global(svg) { color: #899288; }
	.fake-textarea { height: 55px; align-items: flex-start; padding-top: 10px; }
	.fake-checkbox { display: flex; align-items: center; gap: 7px; color: #777f78; font-size: 10px; }
	.fake-checkbox span { width: 14px; height: 14px; border: 1px solid #cfd6ce; border-radius: 3px; }
	.empty-canvas { min-height: 240px; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; padding: 32px 18px; background: rgba(255,255,255,.68); border: 1px dashed #cbd4c9; border-radius: 5px; }
	.empty-glyph { width: 43px; height: 43px; border-radius: 11px; display: grid; place-items: center; color: #508063; background: #e8f0e7; }
	.empty-canvas h3, .entries-empty h3 { margin: 14px 0 5px; font: 700 13px 'Manrope', sans-serif; }
	.empty-canvas p, .entries-empty p { max-width: 245px; margin: 0 0 15px; color: #808980; font-size: 10px; line-height: 1.6; }
	.canvas-endnote { display: flex; justify-content: center; align-items: center; gap: 8px; padding-top: 17px; color: #849084; font: 9px var(--mono); }
	.canvas-endnote > span:first-child { color: #a3aaa2; font-size: 8px; }
	.canvas-endnote > span:last-child { font: italic 10px 'DM Sans', sans-serif; }
	.endnote-line { width: 22px; height: 1px; background: #c9d0c7; }
	.canvas-footer { display: flex; justify-content: space-between; gap: 10px; margin-top: 9px; color: #899189; font-size: 9px; }
	.footer-dot { padding: 0 4px; color: #c3c8c1; }
	.settings-form { display: grid; gap: 16px; margin-top: 21px; }
	.control-label { display: grid; gap: 7px; color: #59635a; font-size: 10px; font-weight: 600; }
	.label-note { color: #a1a8a1; font-weight: 400; }
	.text-control { width: 100%; min-height: 34px; border: 1px solid #e0e5de; border-radius: 4px; background: #fff; padding: 8px 9px; color: #303831; font-size: 10px; font-weight: 400; }
	.text-control::placeholder { color: #a2aaa2; }
	textarea.text-control { resize: vertical; line-height: 1.55; }
	.option-control { min-height: 84px; }
	.help-control { min-height: 68px; }
	.setting-divider { height: 1px; background: #edf0eb; }
	.toggle-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; position: relative; cursor: pointer; }
	.toggle-row > span:first-child { display: grid; gap: 4px; }
	.toggle-row strong { font-size: 10px; font-weight: 600; }
	.toggle-row small { color: #899189; font-size: 9px; }
	.toggle-row input { position: absolute; opacity: 0; width: 30px; height: 19px; right: 0; margin: 0; cursor: pointer; }
	.toggle-track { width: 29px; height: 17px; background: #dfe4dd; border-radius: 10px; transition: background .15s; position: relative; flex: none; }
	.toggle-track::after { content: ''; position: absolute; top: 2px; left: 2px; width: 13px; height: 13px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px #0002; transition: transform .15s; }
	.toggle-row input:checked + .toggle-track { background: #438060; }
	.toggle-row input:checked + .toggle-track::after { transform: translateX(12px); }
	.toggle-row input:focus-visible + .toggle-track { outline: 2px solid #519174; outline-offset: 2px; }
	.settings-summary { display: flex; gap: 10px; align-items: center; }
	.summary-icon { width: 29px; height: 29px; display: grid; place-items: center; background: #f0f4ef; border-radius: 5px; color: #62816a; }
	.settings-summary > span:last-child { display: grid; gap: 3px; }
	.settings-summary strong { font-size: 10px; font-weight: 600; }
	.settings-summary small { color: #899189; font-size: 9px; }
	.tip-block { display: flex; gap: 8px; padding: 10px; background: #f4f7f1; border: 1px solid #e8eee5; border-radius: 5px; color: #728272; }
	.tip-block :global(svg) { flex: none; color: #8d9c76; }
	.tip-block p { margin: 0; font-size: 9px; line-height: 1.5; }
	.entries-view { padding-top: 22px; }
	.entries-toolbar { display: flex; justify-content: space-between; align-items: center; gap: 15px; padding: 18px 20px; background: #fff; border: 1px solid var(--line); border-radius: 6px 6px 0 0; }
	.entries-toolbar h2 { margin: 0 0 5px; font: 700 14px 'Manrope', sans-serif; }
	.entries-toolbar p { margin: 0; color: #7f887f; font-size: 10px; }
	.table-wrap { overflow: auto; border: 1px solid var(--line); border-top: 0; background: #fff; }
	table { width: 100%; border-collapse: collapse; white-space: nowrap; }
	.entries-view th { height: 37px; text-align: left; padding: 0 16px; background: #f8f9f6; border-bottom: 1px solid var(--line); font-size: 8px; }
	.entries-view td { height: 43px; padding: 0 16px; border-bottom: 1px solid #edf0eb; color: #4b554c; font-size: 10px; }
	.entries-view td:first-child { color: #798279; }
	.entries-empty { min-height: 330px; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #fff; border: 1px solid var(--line); border-top: 0; text-align: center; }
	.loading-state { padding: 80px; text-align: center; color: #7f887f; font-size: 12px; }
	.mobile-tabs, .mobile-close { display: none; }
	.modal-backdrop { position: fixed; z-index: 10; inset: 0; background: rgba(29,37,31,.43); display: grid; place-items: center; padding: 20px; animation: fade-in .16s ease-out; }
	.preview-modal { width: min(570px, 100%); max-height: min(88vh, 820px); display: flex; flex-direction: column; overflow: hidden; background: #f8f9f6; border-radius: 8px; box-shadow: 0 22px 70px #17221938; animation: modal-in .2s ease-out; }
	.preview-header { display: flex; justify-content: space-between; align-items: center; padding: 17px 21px; border-bottom: 1px solid var(--line); background: #fff; }
	.preview-kicker { display: flex; gap: 6px; align-items: center; color: #528066; font-size: 9px; }
	.preview-header h2 { margin: 5px 0 0; font: 700 14px 'Manrope', sans-serif; }
	.preview-scroll { overflow-y: auto; padding: 24px clamp(18px, 6vw, 54px) 28px; }
	.preview-form-head { padding: 22px 22px 19px; border-radius: 5px 5px 0 0; border-top: 3px solid #468261; background: white; }
	.preview-form-head h1 { margin: 15px 0 6px; font: 700 20px 'Manrope', sans-serif; }
	.preview-form-head p { margin: 0; color: #777f78; font-size: 11px; line-height: 1.6; }
	.preview-fields { display: grid; gap: 16px; padding: 20px 22px; background: #fff; border-top: 1px solid #eff1ed; border-radius: 0 0 5px 5px; }
	.preview-field { display: grid; gap: 7px; }
	.preview-label { font-size: 11px; font-weight: 600; color: #343d35; }
	.preview-help { margin-top: -4px; color: #818981; font-size: 9px; }
	.preview-field input:not([type=checkbox]), .preview-field select, .preview-field textarea { width: 100%; border: 1px solid #dfe5dd; border-radius: 4px; min-height: 36px; background: #fff; color: #303831; padding: 9px 10px; font-size: 10px; }
	.preview-field textarea { resize: vertical; }
	.preview-field input::placeholder, .preview-field textarea::placeholder { color: #a1a8a1; }
	.preview-check { display: flex; align-items: center; gap: 7px; color: #4f5950; font-size: 10px; }
	.preview-check input { accent-color: #286d50; }
	.preview-submit { min-height: 37px; justify-self: start; padding: 0 15px; }
	:global(.submit-arrow) { transform: rotate(180deg); }
	.preview-privacy { margin: -7px 0 0; color: #939a93; font-size: 9px; }
	.preview-no-fields { padding: 30px; background: #fff; color: #798279; text-align: center; font-size: 11px; }
	.toast { position: fixed; z-index: 20; right: 25px; bottom: 24px; display: flex; align-items: center; gap: 8px; padding: 11px 15px; border: 1px solid #cfe0d2; border-radius: 6px; background: #f5faf5; color: #2e694a; box-shadow: 0 7px 24px #263a2a12; font-size: 11px; animation: toast-in .18s ease-out; }
	@keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
	@keyframes modal-in { from { opacity: .7; transform: translateY(8px) scale(.99); } to { opacity: 1; transform: translateY(0) scale(1); } }
	@keyframes toast-in { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
	@media (max-width: 1120px) {
		.app-shell { grid-template-columns: 216px minmax(0, 1fr); }
		.sidebar { padding-inline: 12px; }
		.topbar { padding-inline: 22px; }
		.content-wrap { padding-inline: 22px; }
		.builder-grid { grid-template-columns: minmax(155px, 185px) minmax(300px, 1fr); }
		.settings-panel { grid-column: 2; }
		.settings-form { grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; }
		.settings-form .setting-divider { display: none; }
	}
	@media (max-width: 760px) {
		.app-shell { display: block; padding-bottom: 62px; }
		.sidebar { display: none; }
		.topbar { height: 54px; padding: 0 15px; }
		.breadcrumbs { gap: 7px; font-size: 10px; min-width: 0; }
		.breadcrumbs strong { max-width: 130px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
		.top-actions { gap: 6px; }
		.save-status { display: none; }
		.button { min-height: 32px; padding: 0 9px; font-size: 10px; }
		.content-wrap { padding: 24px 14px 30px; }
		.page-heading { align-items: flex-start; margin-bottom: 16px; }
		.form-title { width: 75vw; font-size: 22px; }
		.page-subtitle { font-size: 10px; max-width: 250px; line-height: 1.5; }
		.heading-meta { display: none; }
		.workspace-tabs { height: 40px; gap: 19px; }
		.autosave-label { display: none; }
		.builder-grid { display: block; padding-top: 13px; }
		.canvas-toolbar { padding-bottom: 8px; }
		.form-canvas { padding: 12px 10px; min-height: 420px; }
		.form-cover { padding: 18px 15px 14px; }
		.cover-title { font-size: 17px; }
		.field-card { padding-inline: 10px; }
		.field-actions { opacity: 1; }
		.settings-panel, .field-panel { display: none; position: fixed; z-index: 6; left: 10px; right: 10px; bottom: 72px; max-height: min(70vh, 540px); overflow: auto; box-shadow: 0 10px 40px #1c2b1e22; }
		.field-panel.mobile-open, .settings-panel.mobile-open { display: block; }
		.mobile-close { display: inline-grid; }
		.settings-form { grid-template-columns: 1fr; }
		.settings-form .setting-divider { display: block; }
		.mobile-tabs { position: fixed; z-index: 5; display: grid; grid-template-columns: 1fr 1fr; height: 57px; left: 0; right: 0; bottom: 0; padding: 4px 14px max(4px, env(safe-area-inset-bottom)); border-top: 1px solid var(--line); background: rgba(255,255,255,.97); }
		.mobile-tabs button { border: 0; background: transparent; color: #7a847b; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; font-size: 9px; }
		.mobile-tabs button.mobile-tab-active { color: #286b4e; }
		.canvas-footer { font-size: 8px; }
		.entries-toolbar { padding: 14px; align-items: flex-start; }
		.entries-toolbar h2 { font-size: 12px; }
		.entries-toolbar p { max-width: 180px; line-height: 1.5; }
		.entries-view td, .entries-view th { padding-inline: 11px; }
		.modal-backdrop { padding: 0; align-items: end; }
		.preview-modal { width: 100%; max-height: 92dvh; border-radius: 10px 10px 0 0; }
		.preview-scroll { padding: 14px 13px 24px; }
		.preview-header { padding: 14px 16px; }
		.toast { left: 12px; right: 12px; bottom: 68px; justify-content: center; }
	}
	@media (max-width: 380px) {
		.preview-button { font-size: 0; gap: 0; width: 34px; padding: 0; }
		.preview-button :global(svg) { flex: none; }
		.button-publish { font-size: 9px; padding-inline: 7px; }
		.content-wrap { padding-inline: 10px; }
	}
</style>