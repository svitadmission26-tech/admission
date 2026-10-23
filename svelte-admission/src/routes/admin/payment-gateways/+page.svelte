<script lang="ts">
  import { onMount } from "svelte";
  import { toastStore as toast } from "$lib/stores/toastStore";
  import { supabase } from "$lib/supabase";

  // Props
  export let data;

  let gateways = [];
  let loading = true;
  let showModal = false;
  let editingGateway = null;

  // Form fields
  let formProviderName = "";
  let formDisplayName = "";
  let formIsActive = false;
  let formMode = "test";
  let formType = "sdk"; // 'sdk' or 'redirect'
  let formEndpointUrl = "";
  let formConfig = "{}";

  onMount(async () => {
    await loadGateways();
  });

  async function loadGateways() {
    loading = true;
    const { data: g, error } = await supabase
      .from("payment_gateways")
      .select(
        "id, provider_name, display_name, is_active, mode, type, endpoint_url, config, created_at",
      )
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error loading gateways:", error);
      if (error.code === "42P01") {
        toast.error(
          'Table "payment_gateways" does not exist. Please run the migration.',
        );
      } else {
        toast.error("Failed to load gateways");
      }
    } else {
      gateways = g;
    }
    loading = false;
  }

  function openModal(gateway = null) {
    editingGateway = gateway;
    if (gateway) {
      formProviderName = gateway.provider_name;
      formDisplayName = gateway.display_name;
      formIsActive = gateway.is_active;
      formMode = gateway.mode;
      formType = gateway.type || "sdk";
      formEndpointUrl = gateway.endpoint_url || "";
      formConfig = JSON.stringify(gateway.config, null, 2);
    } else {
      formProviderName = "";
      formDisplayName = "";
      formIsActive = false;
      formMode = "test";
      formType = "sdk";
      formEndpointUrl = "";
      formConfig = `{
  "merchant_key": "",
  "merchant_salt": ""
}`;
    }
    showModal = true;
  }

  function closeModal() {
    showModal = false;
    editingGateway = null;
  }

  async function saveGateway() {
    let parsedConfig;
    try {
      parsedConfig = JSON.parse(formConfig);
    } catch (e) {
      toast.error("Invalid JSON configuration");
      return;
    }

    const payload = {
      provider_name: formProviderName,
      display_name: formDisplayName,
      is_active: formIsActive,
      mode: formMode,
      type: formType,
      endpoint_url: formEndpointUrl,
      config: parsedConfig,
    };

    let error;
    if (editingGateway) {
      const { error: updateError } = await supabase
        .from("payment_gateways")
        .update(payload)
        .eq("id", editingGateway.id);
      error = updateError;
    } else {
      const { error: insertError } = await supabase
        .from("payment_gateways")
        .insert(payload);
      error = insertError;
    }

    if (error) {
      console.error("Error saving gateway:", error);
      toast.error("Failed to save gateway");
    } else {
      toast.success("Gateway saved successfully");
      closeModal();
      loadGateways();
    }
  }

  async function toggleActive(gateway) {
    const { error } = await supabase
      .from("payment_gateways")
      .update({ is_active: !gateway.is_active })
      .eq("id", gateway.id);

    if (error) {
      toast.error("Failed to update status");
    } else {
      toast.success("Status updated");
      loadGateways();
    }
  }
</script>

<div class="d-flex justify-content-between align-items-center mb-4">
  <h2 class="h4 mb-0">Payment Gateways</h2>
  <button class="btn btn-primary" on:click={() => openModal()}>
    <i class="bi bi-plus-lg me-2"></i> Add Gateway
  </button>
</div>

{#if loading}
  <div class="text-center py-5">
    <div class="spinner-border text-primary" role="status">
      <span class="visually-hidden">Loading...</span>
    </div>
  </div>
{:else if gateways.length === 0}
  <div class="text-center py-5 text-muted">
    <i class="bi bi-credit-card fs-1 d-block mb-3"></i>
    <p>No payment gateways configured.</p>
    <button class="btn btn-outline-primary" on:click={() => openModal()}
      >Configure First Gateway</button
    >
  </div>
{:else}
  <div class="row g-4">
    {#each gateways as gateway}
      <div class="col-md-6 col-lg-4">
        <div
          class="card h-100 shadow-sm {gateway.is_active
            ? 'border-primary'
            : ''}"
        >
          <div
            class="card-header bg-transparent d-flex justify-content-between align-items-center"
          >
            <div>
              <span
                class="badge {gateway.mode === 'live'
                  ? 'bg-success'
                  : 'bg-warning text-dark'} me-1"
              >
                {gateway.mode.toUpperCase()}
              </span>
              <span class="badge bg-secondary"
                >{gateway.type === "redirect" ? "REDIRECT" : "SDK"}</span
              >
            </div>
            <div class="form-check form-switch">
              <input
                class="form-check-input"
                type="checkbox"
                checked={gateway.is_active}
                on:change={() => toggleActive(gateway)}
                title="Toggle Active Status"
              />
            </div>
          </div>
          <div class="card-body">
            <h5 class="card-title text-primary mb-1">{gateway.display_name}</h5>
            <p class="text-muted small mb-3">{gateway.provider_name}</p>

            <div
              class="bg-light p-2 rounded small font-monospace text-truncate mb-3"
            >
              ID: {gateway.id.substring(0, 8)}...
            </div>
          </div>
          <div class="card-footer bg-transparent border-top-0 text-end">
            <button
              class="btn btn-sm btn-outline-secondary"
              on:click={() => openModal(gateway)}
            >
              <i class="bi bi-pencil me-1"></i> Configure
            </button>
          </div>
        </div>
      </div>
    {/each}
  </div>
{/if}

<!-- Configuration Modal -->
{#if showModal}
  <div
    class="modal fade show d-block"
    tabindex="-1"
    style="background: rgba(0,0,0,0.5)"
  >
    <div class="modal-dialog modal-lg">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">
            {editingGateway ? "Edit Gateway" : "Add New Gateway"}
          </h5>
          <button type="button" class="btn-close" on:click={closeModal}
          ></button>
        </div>
        <div class="modal-body">
          <div class="row g-3">
            <div class="col-md-6">
              <label class="form-label">Provider Name</label>
              <select class="form-select" bind:value={formProviderName}>
                <option value="" disabled>Select Provider</option>
                <option value="Razorpay">Razorpay</option>
                <option value="Stripe">Stripe</option>
                <option value="PayU">PayU</option>
                <option value="BillDesk">BillDesk</option>
                <option value="CashFree">CashFree</option>
                <option value="Custom">Custom / Bank</option>
              </select>
              <div class="form-text">The backend service provider.</div>
            </div>
            <div class="col-md-6">
              <label class="form-label">Display Name</label>
              <input
                type="text"
                class="form-control"
                bind:value={formDisplayName}
                placeholder="e.g. Credit/Debit Card"
              />
              <div class="form-text">Label shown to students.</div>
            </div>

            <div class="col-md-6">
              <label class="form-label">Integration Type</label>
              <div>
                <div class="form-check form-check-inline">
                  <input
                    class="form-check-input"
                    type="radio"
                    id="typeSdk"
                    bind:group={formType}
                    value="sdk"
                  />
                  <label class="form-check-label" for="typeSdk"
                    >SDK / Popup</label
                  >
                </div>
                <div class="form-check form-check-inline">
                  <input
                    class="form-check-input"
                    type="radio"
                    id="typeRedirect"
                    bind:group={formType}
                    value="redirect"
                  />
                  <label class="form-check-label" for="typeRedirect"
                    >Redirect URL</label
                  >
                </div>
              </div>
            </div>

            <div class="col-md-6">
              <label class="form-label">Mode</label>
              <select class="form-select" bind:value={formMode}>
                <option value="test">Test / Sandbox</option>
                <option value="live">Live / Production</option>
              </select>
            </div>

            {#if formType === "redirect"}
              <div class="col-12">
                <label class="form-label">Endpoint URL</label>
                <input
                  type="text"
                  class="form-control"
                  bind:value={formEndpointUrl}
                  placeholder="https://secure.payu.in/_payment"
                />
                <div class="form-text">
                  The URL to redirect the user to (for Redirect flow).
                </div>
              </div>
            {/if}

            <div class="col-12 d-flex align-items-end">
              <div class="form-check form-switch mb-2">
                <input
                  class="form-check-input"
                  type="checkbox"
                  id="activeCheck"
                  bind:checked={formIsActive}
                />
                <label class="form-check-label" for="activeCheck"
                  >Gateway is Active</label
                >
              </div>
            </div>

            <div class="col-12">
              <label class="form-label">Configuration (JSON)</label>
              <textarea
                class="form-control font-monospace"
                rows="8"
                bind:value={formConfig}
                placeholder={`{
  "merchant_key": "...",
  "merchant_salt": "..."
}`}
              ></textarea>
              <div class="form-text text-danger">
                <i class="bi bi-exclamation-triangle"></i>
                Ensure this JSON is valid. Secrets stored here are visible to admins.
                For higher security, consider using environment variables.
              </div>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" on:click={closeModal}
            >Cancel</button
          >
          <button type="button" class="btn btn-primary" on:click={saveGateway}
            >Save Configuration</button
          >
        </div>
      </div>
    </div>
  </div>
{/if}
