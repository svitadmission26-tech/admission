<script lang="ts">
    interface FeeItem {
        name: string;
        amount: number;
        allow_partial: boolean;
    }

    interface FeeSection {
        name: string;
        items: FeeItem[];
    }

    let { value = $bindable([]), onTotalChange } = $props<{ 
        value: FeeSection[], 
        onTotalChange?: (total: number) => void 
    }>();

    function addSection() {
        value.push({ name: 'New Section', items: [] });
        update();
    }

    function removeSection(index: number) {
        value.splice(index, 1);
        update();
    }

    function addItem(sectionIndex: number) {
        value[sectionIndex].items.push({ name: 'New Item', amount: 0, allow_partial: false });
        update();
    }

    function removeItem(sectionIndex: number, itemIndex: number) {
        value[sectionIndex].items.splice(itemIndex, 1);
        update();
    }

    function update() {
        // Calculate total
        const total = value.reduce((sum, section) => {
            return sum + (section.items?.reduce((s: number, i: any) => s + (Number(i.amount) || 0), 0) || 0);
        }, 0);
        
        if (onTotalChange) {
            onTotalChange(total);
        }
    }
</script>

<div class="fee-structure-builder">
    {#each value as section, sIndex}
        <div class="card mb-3">
            <div class="card-header d-flex justify-content-between align-items-center">
                <input 
                    type="text" 
                    class="form-control form-control-sm me-2 fw-bold" 
                    bind:value={section.name} 
                    oninput={update} 
                    placeholder="Section Name"
                    style="max-width: 200px;"
                />
                <button type="button" class="btn btn-sm btn-outline-danger" onclick={() => removeSection(sIndex)}>
                    Remove Section
                </button>
            </div>
            <div class="card-body">
                <table class="table table-sm table-borderless mb-0 align-middle">
                    <thead>
                        <tr>
                            <th>Item Name</th>
                            <th style="width: 150px;">Amount</th>
                            <th style="width: 100px;" class="text-center">Splittable?</th>
                            <th style="width: 50px;"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each section.items as item, iIndex}
                            <tr>
                                <td>
                                    <input 
                                        type="text" 
                                        class="form-control form-control-sm" 
                                        bind:value={item.name} 
                                        oninput={update}
                                        placeholder="Item Name" 
                                    />
                                </td>
                                <td>
                                    <input 
                                        type="number" 
                                        class="form-control form-control-sm" 
                                        bind:value={item.amount} 
                                        oninput={update}
                                        placeholder="0.00" 
                                    />
                                </td>
                                <td class="text-center">
                                    <div class="form-check d-flex justify-content-center">
                                        <input 
                                            class="form-check-input" 
                                            type="checkbox" 
                                            bind:checked={item.allow_partial} 
                                            onchange={update}
                                            title="Allow half payment for this item"
                                        />
                                    </div>
                                </td>
                                <td>
                                    <button type="button" class="btn btn-sm btn-link text-danger p-0" onclick={() => removeItem(sIndex, iIndex)}>
                                        &times;
                                    </button>
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
                <button type="button" class="btn btn-sm btn-link text-decoration-none" onclick={() => addItem(sIndex)}>
                    + Add Item
                </button>
            </div>
        </div>
    {/each}

    <button type="button" class="btn btn-sm btn-outline-primary" onclick={addSection}>
        + Add Fee Section
    </button>
</div>
