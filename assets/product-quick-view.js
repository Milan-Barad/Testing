const { MinimogThemeStyles, MinimogThemeScripts } = window;

class QuickView {
  constructor() {
    this.modal = new MinimogTheme.Modal();
    this.isOpen = false;
    this.isLoading = false;

    // Event delegation for quick view button
    addEventDelegate({
      selector: ".m-product-quickview-button",
      handler: (e, target) => {
        e.preventDefault();
        if (this.isLoading) return;
        this.target = target;
        this.toggleLoading(true);
        const productHandle = target.dataset.productHandle;
        if (productHandle) this.loadProductQuickView(productHandle);
      },
    });

    // Subscribe to cart update events
    window.MinimogEvents.subscribe(MinimogTheme.pubSubEvents.cartUpdate, () => {
      if (this.modal) this.close();
    });
  }

  // Load product quick view HTML
  loadProductQuickView(productHandle) {
    if (this.isOpen) {
      this.close(); // Close any existing modal before loading a new one
    }
    this.isLoading = true;

    this.loadAssets([MinimogThemeStyles.product, MinimogThemeStyles.productInventory], "quick-view-assets")
      .then(() =>
        fetchSection("product-quickview", { url: `${window.MinimogSettings.base_url}products/${productHandle}` })
      )
      .then((html) => {
        this.modalContent = html.querySelector(".m-product-quickview");
        const firstModel = html.querySelector("product-model");
        this.mediaGallery = this.modalContent.querySelector("media-gallery");

        return this.loadAssets(
          [MinimogThemeScripts.productMedia, MinimogThemeScripts.variantsPicker, MinimogThemeScripts.productInventory],
          "variants-picker"
        ).then(() => {
          const colorScheme = this.modalContent.dataset.colorScheme;
          this.modal.appendChild(this.modalContent);
          this.modal.setWidth("960px");
          this.modal.open();
          this.modal.setSizes(`m-gradient ${colorScheme}`);
          this.toggleLoading(false);
          this.isOpen = true;
          this.isLoading = false; // Reset loading state

          if (firstModel) {
            return this.loadAssets(
              [
                MinimogThemeScripts.productModel,
                "https://cdn.shopify.com/shopifycloud/model-viewer-ui/assets/v1.0/model-viewer-ui.css",
              ],
              "product-model-assets"
            );
          }
        });
      })
      .then(() => {
        document.dispatchEvent(
          new CustomEvent("quick-view:loaded", {
            detail: { productUrl: this.target.dataset.productHandle },
          })
        );
      })
      .catch((error) => {
        console.error("Error loading product quick view:", error);
        this.toggleLoading(false);
      });
  }

  // Load assets helper function
  loadAssets(assets, key) {
    return new Promise((resolve, reject) => {
      loadAssetsNew(assets, key, resolve, reject);
    });
  }

  // Close the quick view modal
  close(e) {
    this.modal.close(e);
    this.isOpen = false;
  }

  // Toggle loading spinner on the target element
  toggleLoading(isLoading) {
    if (isLoading) {
      this.target.classList.add("m-spinner-loading");
    } else {
      this.target.classList.remove("m-spinner-loading");
    }
  }
}

// Initialize the QuickView instance
MinimogTheme.ProductQuickView = new QuickView();
