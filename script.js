const tiles = document.querySelectorAll(".tile");

const revealTiles = () => {
  tiles.forEach((tile, index) => {
    setTimeout(() => {
      tile.classList.add("is-visible");
    }, 120 * index);
  });
};

window.addEventListener("load", revealTiles);
