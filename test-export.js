try {
    const app = require("./server");
    console.log("Type of export:", typeof app);
    console.log("Is function?", typeof app === "function");
    console.log("Export keys:", Object.keys(app));
} catch (e) {
    console.error(e);
}
