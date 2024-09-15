console.log("Building...");

await Bun.build({
    entrypoints: ["./src/index.ts"],
    outdir: "./dist",
    target: "bun",
    format: "esm",
    minify: false,
    splitting: true
});

console.log("Done");
