<script>
    export let formData = { name: "John" };
</script>
{#snippet mySnippet(key)}
    <input bind:value={formData[key]} />
{/snippet}
{@render mySnippet('name')}
