if (!customElements.get("variant-picker")) {
  class VariantPicker extends HTMLElement {
    constructor() {
      super();
      if (Shopify.designMode) {
        setTimeout(() => this.init(), 200);
      } else {
        this.init();
      }
    }

    init() {
      this.selectors = {
        error: ".m-product-form-message",
        variantIdInput: '[name="id"]',
        pickerFields: ["[data-picker-field]"],
        optionNodes: [".m-product-option--node"],
        productSku: "[data-variant-sku]",
        productAvailability: "[data-availability]",
        shareUrlInput: "[data-share-url]",
        stockCountdown: ".prod__stock-countdown",
        productWrapper: ".m-main-product--wrapper",
        variantDescription: ".variant-option-description", // Added selector for description
      };

      this.productWrapper = this.closest(this.selectors.productWrapper);
      this.productForm = this.productWrapper.querySelector("product-form");
      this.domNodes = queryDomNodes(this.selectors, this.productWrapper);

      const themeProducts = window._themeProducts || {};
      const { productId, sectionId, productUrl, hasOnlyDefaultVariant, showFeaturedMedia } = this.dataset;

      Object.assign(this, {
        productId,
        sectionId,
        productUrl,
        hasOnlyDefaultVariant: hasOnlyDefaultVariant === "true",
        showFeaturedMedia: showFeaturedMedia === "true",
        variantData: this.getVariantData(),
        productData: Object.assign(this.getProductJson(), themeProducts[productId]),
      });

      this.handleQueryString();
      this.handleVariantGroupImages();
      this.selectInitialVariant();
      this.setupEventListeners();
      this.initOptionSwatches();
    }

    handleQueryString() {
      const hasQueryString = window.location.search.includes("?variant=");
      const disableSelectedVariantDefault = this.dataset.disableSelectedVariantDefault === "true";
      const hasMultipleVariants = this.productData && this.productData.variants && this.productData.variants.length > 1;

      this.selectedVariantDefault = disableSelectedVariantDefault && hasMultipleVariants && !hasQueryString;

      if (this.selectedVariantDefault) {
        this.disableSelectedVariantDefault();
      }
    }

    handleVariantGroupImages() {
      if (this.dataset.enableVariantGroupImages === "true") {
        this.enableVariantGroupImages = true;
        this.variantGroupImages = this.getVariantGroupImageData();
      } else {
        this.enableVariantGroupImages = false;
      }
    }

    selectInitialVariant() {
      const variantIdInput = this.productWrapper.querySelector(this.selectors.variantIdInput);
      const selectedVariantId = Number(variantIdInput.value);
      const currentVariant = this.productData.variants.find((variant) => variant.id === selectedVariantId);

      this.selectedVariant = variantIdInput;
      this.currentVariant = currentVariant;
      this.productData.current_variant_id = currentVariant ? currentVariant.id : null;
      this.productData.initialVariant = currentVariant;

      if (currentVariant) {
        this.getDataImageVariant(currentVariant.id);
        this.hideSoldOutAndUnavailableOptions();
        this.updateButton(!currentVariant.available);
        this.updateVariantDescription(); // Update description on initial variant selection
      }
    }

    setupEventListeners() {
      this.hasSetupMediaData = false;
      const mediaGalleryHandler = this.getMediaGallery.bind(this);

      mediaGalleryHandler();
      ["matchMobile", "unmatchMobile"].forEach((event) => document.addEventListener(event, mediaGalleryHandler));

      this.addEventListener("change", this.onVariantChange);
    }

    getMediaGallery() {
      return this.waitForMediaGallery().then(this.setupMediaGallery.bind(this));
    }

    waitForMediaGallery() {
      return new Promise((resolve) => {
        const checkMediaGallery = () => {
          this.mediaGallery = this.productWrapper.querySelector("media-gallery");
          this.mediaGalleryMobile = this.productWrapper.querySelector("media-gallery-mobile");

          const isMediaGalleryReady =
            this.mediaGallery &&
            (this.mediaGallery.view === "featured-product" || this.mediaGallery.view === "quick-view") &&
            this.mediaGallery.mediaMode;

          const isBothGalleriesReady =
            this.mediaGallery &&
            this.mediaGalleryMobile &&
            this.mediaGallery.mediaMode &&
            this.mediaGalleryMobile.mediaMode;

          if (isMediaGalleryReady || isBothGalleriesReady) {
            resolve();
          } else {
            setTimeout(checkMediaGallery, 100);
          }
        };

        checkMediaGallery();
      });
    }

    setupMediaGallery() {
      const isMobile = MinimogTheme.config.mqlMobile;
      const effectiveMediaGallery = isMobile ? this.mediaGalleryMobile || this.mediaGallery : this.mediaGallery;
      this.media = effectiveMediaGallery;

      if (!this.hasSetupMediaData) {
        if (isMobile || effectiveMediaGallery.mediaMode === "slider") {
          this.slides = effectiveMediaGallery.slider && effectiveMediaGallery.slider.slides;
          this.slidesNav = effectiveMediaGallery.navSlider && effectiveMediaGallery.navSlider.slides;
        } else {
          this.mediaItems = effectiveMediaGallery.querySelectorAll(".m-product-media--item");
        }

        this.layout = !isMobile ? effectiveMediaGallery.layout : undefined;
      }

      if (!this.showFeaturedMedia || (this.enableVariantGroupImages && this.variantGroupImages.enable)) {
        this.updateMedia();
      }
      this.hasSetupMediaData = true;
    }

    disableSelectedVariantDefault() {
      // Reset radio options
      this.querySelectorAll('input[type="radio"]').forEach((radioOption) => {
        radioOption.checked = false;
      });

      // Clear data-selected-value for radio picker fields
      this.querySelectorAll("[data-picker-field='radio']").forEach((radio) => {
        radio.setAttribute("data-selected-value", "");
      });

      // Reset select elements and clear data-selected-value for select picker fields
      this.querySelectorAll("[data-picker-field='select']").forEach((pickerSelect) => {
        const selectElm = pickerSelect.querySelector("select");
        if (selectElm) selectElm.value = "";
        pickerSelect.setAttribute("data-selected-value", "");
      });

      // Clear text content for selected option labels
      this.querySelectorAll(".option-label--selected").forEach((label) => {
        label.textContent = "";
      });

      // Reset variant ID if applicable
      if (this.productForm) {
        const variantIdEl = this.productForm.querySelector("[name='id']");
        if (variantIdEl && !this.hasOnlyDefaultVariant) {
          variantIdEl.value = "";
        }
      }
    }

    setProductAsUnavailable() {
      this.updateButton(true);
      this.setUnavailable();
      this.updateVariantDescription(); // Update description when unavailable
    }

    updateProductDetailsForVariant() {
      this.getDataImageVariant(this.currentVariant.id);
      this.updateMedia();
      this.updateBrowserHistory();
      this.updateVariantInput();
      this.updateProductMeta();
      this.updatePrice();
      this.updateVariantDescription(); // Update description on variant change

      const isSoldOut = !this.currentVariant.available;
      const buttonText = isSoldOut ? window.MinimogStrings.soldOut : "";
      this.updateButton(isSoldOut, buttonText);

      this.hideSoldOutAndUnavailableOptions();
    }

    onVariantChange() {
      this.getSelectedOptions();
      this.getSelectedVariant();

      this.updatePickupAvailability();
      this.removeErrorMessage();

      if (!this.currentVariant) {
        this.setProductAsUnavailable();
        return;
      }

      this.updateProductDetailsForVariant();

      const variantChangeEvent = new CustomEvent("variant:changed", {
        detail: { variant: this.currentVariant },
      });
      window.MinimogEvents.emit(`${this.productId}__VARIANT_CHANGE`, this.currentVariant, this);
      document.dispatchEvent(variantChangeEvent);
    }

    getDataImageVariant(variantId) {
      if (!this.variantGroupImages || !this.variantGroupImages.enable) return;

      const currentVariantMedia = this.variantGroupImages.mapping.find((variant) => Number(variant.id) === variantId);
      if (currentVariantMedia) {
        this.currentVariantMedia = currentVariantMedia.media;
      }
    }

    getProductJson() {
      try {
        const productDataElement = this.productWrapper.querySelector("#productData[type='application/json']");
        if (!productDataElement) throw new Error("Fallback product data element not found.");
        return JSON.parse(productDataElement.textContent);
      } catch (error) {
        console.error("Error loading fallback product data:", error);
        return null;
      }
    }

    getSelectedVariant() {
      let variant;
      let options = [...this.options];

      for (let attempt = 0; attempt < this.options.length; attempt++) {
        variant = getVariantFromOptionArray(this.productData, options);

        if (variant || options.length === 0) {
          break;
        }

        options.pop();
      }

      if (variant) {
        this.options = [...variant.options];
        this.updateSelectedOptions();
      }

      this.currentVariant = variant;
    }

    getSelectedOptions() {
      const pickerFields = Array.from(this.querySelectorAll("[data-picker-field]"));

      this.options = pickerFields
        .map((field) => {
          const type = field.dataset.pickerField;

          if (type === "radio") {
            const checkedRadio = field.querySelector("input:checked");
            return checkedRadio ? checkedRadio.value : undefined;
          }

          if (field.querySelector("select"))彼此

System: You are Grok 3 built by xAI.

It looks like your message was cut off. Based on your request, you want the `{{ variant.metafields.custom.description_new.value }}` content in the `variant-option-description` div to update dynamically when the variant changes in the provided `variant-picker` JavaScript and HTML code. The code you shared is a Shopify custom element (`variant-picker`) that manages product variant selection, and the HTML includes a `variant-color` component with a description that should update based on the selected variant's metafield.

I’ve modified the `VariantPicker` class to include a new method, `updateVariantDescription`, and integrated it into the `selectInitialVariant`, `updateProductDetailsForVariant`, and `setProductAsUnavailable` methods to ensure the description updates whenever the variant changes or the product becomes unavailable. The changes assume that the `variantData` (from `getVariantData`) contains the `metafields.custom.description_new.value` for each variant, which is typical in Shopify's product data structure.

Here’s the updated JavaScript code wrapped in an `<xaiArtifact>` tag, with the same `artifact_id` as the example you provided (since this is an update to the existing code). The HTML remains unchanged but is included for context. The key additions are:

1. Added `variantDescription` to the `selectors` object to target the `.variant-option-description` element.
2. Created a new `updateVariantDescription` method to update the description based on the current variant's metafield.
3. Called `updateVariantDescription` in `selectInitialVariant`, `updateProductDetailsForVariant`, and `setProductAsUnavailable` to ensure the description updates appropriately.

<xaiArtifact artifact_id="32078323-6620-4070-8442-3bf1d826240c" artifact_version_id="3b8c1e98-c2d9-4299-a1ba-5f8dddb77b45" title="variant-picker.js" contentType="text/javascript">
if (!customElements.get("variant-picker")) {
  class VariantPicker extends HTMLElement {
    constructor() {
      super();
      if (Shopify.designMode) {
        setTimeout(() => this.init(), 200);
      } else {
        this.init();
      }
    }

    init() {
      this.selectors = {
        error: ".m-product-form-message",
        variantIdInput: '[name="id"]',
        pickerFields: ["[data-picker-field]"],
        optionNodes: [".m-product-option--node"],
        productSku: "[data-variant-sku]",
        productAvailability: "[data-availability]",
        shareUrlInput: "[data-share-url]",
        stockCountdown: ".prod__stock-countdown",
        productWrapper: ".m-main-product--wrapper",
        variantDescription: ".variant-option-description", // Added selector for description
      };

      this.productWrapper = this.closest(this.selectors.productWrapper);
      this.productForm = this.productWrapper.querySelector("product-form");
      this.domNodes = queryDomNodes(this.selectors, this.productWrapper);

      const themeProducts = window._themeProducts || {};
      const { productId, sectionId, productUrl, hasOnlyDefaultVariant, showFeaturedMedia } = this.dataset;

      Object.assign(this, {
        productId,
        sectionId,
        productUrl,
        hasOnlyDefaultVariant: hasOnlyDefaultVariant === "true",
        showFeaturedMedia: showFeaturedMedia === "true",
        variantData: this.getVariantData(),
        productData: Object.assign(this.getProductJson(), themeProducts[productId]),
      });

      this.handleQueryString();
      this.handleVariantGroupImages();
      this.selectInitialVariant();
      this.setupEventListeners();
      this.initOptionSwatches();
    }

    handleQueryString() {
      const hasQueryString = window.location.search.includes("?variant=");
      const disableSelectedVariantDefault = this.dataset.disableSelectedVariantDefault === "true";
      const hasMultipleVariants = this.productData && this.productData.variants && this.productData.variants.length > 1;

      this.selectedVariantDefault = disableSelectedVariantDefault && hasMultipleVariants && !hasQueryString;

      if (this.selectedVariantDefault) {
        this.disableSelectedVariantDefault();
      }
    }

    handleVariantGroupImages() {
      if (this.dataset.enableVariantGroupImages === "true") {
        this.enableVariantGroupImages = true;
        this.variantGroupImages = this.getVariantGroupImageData();
      } else {
        this.enableVariantGroupImages = false;
      }
    }

    selectInitialVariant() {
      const variantIdInput = this.productWrapper.querySelector(this.selectors.variantIdInput);
      const selectedVariantId = Number(variantIdInput.value);
      const currentVariant = this.productData.variants.find((variant) => variant.id === selectedVariantId);

      this.selectedVariant = variantIdInput;
      this.currentVariant = currentVariant;
      this.productData.current_variant_id = currentVariant ? currentVariant.id : null;
      this.productData.initialVariant = currentVariant;

      if (currentVariant) {
        this.getDataImageVariant(currentVariant.id);
        this.hideSoldOutAndUnavailableOptions();
        this.updateButton(!currentVariant.available);
        this.updateVariantDescription(); // Update description on initial variant selection
      }
    }

    setupEventListeners() {
      this.hasSetupMediaData = false;
      const mediaGalleryHandler = this.getMediaGallery.bind(this);

      mediaGalleryHandler();
      ["matchMobile", "unmatchMobile"].forEach((event) => document.addEventListener(event, mediaGalleryHandler));

      this.addEventListener("change", this.onVariantChange);
    }

    getMediaGallery() {
      return this.waitForMediaGallery().then(this.setupMediaGallery.bind(this));
    }

    waitForMediaGallery() {
      return new Promise((resolve) => {
        const checkMediaGallery = () => {
          this.mediaGallery = this.productWrapper.querySelector("media-gallery");
          this.mediaGalleryMobile = this.productWrapper.querySelector("media-gallery-mobile");

          const isMediaGalleryReady =
            this.mediaGallery &&
            (this.mediaGallery.view === "featured-product" || this.mediaGallery.view === "quick-view") &&
            this.mediaGallery.mediaMode;

          const isBothGalleriesReady =
            this.mediaGallery &&
            this.mediaGalleryMobile &&
            this.mediaGallery.mediaMode &&
            this.mediaGalleryMobile.mediaMode;

          if (isMediaGalleryReady || isBothGalleriesReady) {
            resolve();
          } else {
            setTimeout(checkMediaGallery, 100);
          }
        };

        checkMediaGallery();
      });
    }

    setupMediaGallery() {
      const isMobile = MinimogTheme.config.mqlMobile;
      const effectiveMediaGallery = isMobile ? this.mediaGalleryMobile || this.mediaGallery : this.mediaGallery;
      this.media = effectiveMediaGallery;

      if (!this.hasSetupMediaData) {
        if (isMobile || effectiveMediaGallery.mediaMode === "slider") {
          this.slides = effectiveMediaGallery.slider && effectiveMediaGallery.slider.slides;
          this.slidesNav = effectiveMediaGallery.navSlider && effectiveMediaGallery.navSlider.slides;
        } else {
          this.mediaItems = effectiveMediaGallery.querySelectorAll(".m-product-media--item");
        }

        this.layout = !isMobile ? effectiveMediaGallery.layout : undefined;
      }

      if (!this.showFeaturedMedia || (this.enableVariantGroupImages && this.variantGroupImages.enable)) {
        this.updateMedia();
      }
      this.hasSetupMediaData = true;
    }

    disableSelectedVariantDefault() {
      this.querySelectorAll('input[type="radio"]').forEach((radioOption) => {
        radioOption.checked = false;
      });

      this.querySelectorAll("[data-picker-field='radio']").forEach((radio) => {
        radio.setAttribute("data-selected-value", "");
      });

      this.querySelectorAll("[data-picker-field='select']").forEach((pickerSelect) => {
        const selectElm = pickerSelect.querySelector("select");
        if (selectElm) selectElm.value = "";
        pickerSelect.setAttribute("data-selected-value", "");
      });

      this.querySelectorAll(".option-label--selected").forEach((label) => {
        label.textContent = "";
      });

      if (this.productForm) {
        const variantIdEl = this.productForm.querySelector("[name='id']");
        if (variantIdEl && !this.hasOnlyDefaultVariant) {
          variantIdEl.value = "";
        }
      }
    }

    setProductAsUnavailable() {
      this.updateButton(true);
      this.setUnavailable();
      this.updateVariantDescription(); // Update description when unavailable
    }

    updateProductDetailsForVariant() {
      this.getDataImageVariant(this.currentVariant.id);
      this.updateMedia();
      this.updateBrowserHistory();
      this.updateVariantInput();
      this.updateProductMeta();
      this.updatePrice();
      this.updateVariantDescription(); // Update description on variant change

      const isSoldOut = !this.currentVariant.available;
      const buttonText = isSoldOut ? window.MinimogStrings.soldOut : "";
      this.updateButton(isSoldOut, buttonText);

      this.hideSoldOutAndUnavailableOptions();
    }

    onVariantChange() {
      this.getSelectedOptions();
      this.getSelectedVariant();

      this.updatePickupAvailability();
      this.removeErrorMessage();

      if (!this.currentVariant) {
        this.setProductAsUnavailable();
        return;
      }

      this.updateProductDetailsForVariant();

      const variantChangeEvent = new CustomEvent("variant:changed", {
        detail: { variant: this.currentVariant },
      });
      window.MinimogEvents.emit(`${this.productId}__VARIANT_CHANGE`, this.currentVariant, this);
      document.dispatchEvent(variantChangeEvent);
    }

    getDataImageVariant(variantId) {
      if (!this.variantGroupImages || !this.variantGroupImages.enable) return;

      const currentVariantMedia = this.variantGroupImages.mapping.find((variant) => Number(variant.id) === variantId);
      if (currentVariantMedia) {
        this.currentVariantMedia = currentVariantMedia.media;
      }
    }

    getProductJson() {
      try {
        const productDataElement = this.productWrapper.querySelector("#productData[type='application/json']");
        if (!productDataElement) throw new Error("Fallback product data element not found.");
        return JSON.parse(productDataElement.textContent);
      } catch (error) {
        console.error("Error loading fallback product data:", error);
        return null;
      }
    }

    getSelectedVariant() {
      let variant;
      let options = [...this.options];

      for (let attempt = 0; attempt < this.options.length; attempt++) {
        variant = getVariantFromOptionArray(this.productData, options);

        if (variant || options.length === 0) {
          break;
        }

        options.pop();
      }

      if (variant) {
        this.options = [...variant.options];
        this.updateSelectedOptions();
      }

      this.currentVariant = variant;
    }

    getSelectedOptions() {
      const pickerFields = Array.from(this.querySelectorAll("[data-picker-field]"));

      this.options = pickerFields
        .map((field) => {
          const type = field.dataset.pickerField;

          if (type === "radio") {
            const checkedRadio = field.querySelector("input:checked");
            return checkedRadio ? checkedRadio.value : undefined;
          }

          if (field.querySelector("select")) {
            return field.querySelector("select").value;
          }

          return undefined;
        })
        .filter((option) => option !== undefined);
    }

    updateSelectedOptions() {
      this.domNodes.pickerFields.forEach((field, index) => {
        const selectedValue = field.dataset.selectedValue;
        const optionValue = this.options[index];
        if (selectedValue !== optionValue) {
          const selectedOption = field.querySelector(`input[value="${optionValue.replace(/["\\]/g, "\\$&")}"]`);
          if (selectedOption) {
            selectedOption.checked = true;
            field.updateSelectedValue();
          }
        }
      });
    }

    removeLoading(mediaElement) {
      if (!mediaElement) return;

      mediaElement.removeAttribute("data-media-loading");
      const firstChild = mediaElement.firstElementChild;
      if (firstChild) firstChild.style.opacity = 1;
    }

    handleImageZoom(mediaItems, mediaContext) {
      const customData = mediaItems.map((item) => {
        const { mediaType, index } = item.dataset;
        if (mediaType === "image") {
          const { mediaSrc, mediaWidth, mediaHeight, mediaAlt } = item.querySelector(".m-product-media").dataset;
          return {
            src: mediaSrc,
            width: parseInt(mediaWidth),
            height: parseInt(mediaHeight),
            alt: mediaAlt,
            id: index,
          };
        }
        return {
          html: `<div class="pswp__${mediaType}">${item.innerHTML}</div>`,
          type: mediaType,
          id: index,
        };
      });

      if (mediaContext && mediaContext.lightbox) {
        mediaContext.lightbox.destroy();
        mediaContext.handlePhotoswipe(customData);
        mediaContext.initPhotoswipe();
      }
    }

    updateMedia() {
      if (!this.currentVariant) return;

      let mainItems = [],
        navItems = [];

      const reorderItems = (referenceItems, items, isNav = false, isSlider = false) => {
        let reorderedItems = [];

        referenceItems.forEach((referenceItem, index) => {
          const foundItem = items.find(
            (item) => item.querySelector("[data-media-id]").dataset.mediaId === referenceItem
          );
          if (foundItem) {
            foundItem.dataset.index = index;
            foundItem.dataset.swiperSlideIndex = index;
            reorderedItems.push(foundItem);
          }
        });

        items.forEach((item) => {
          const dataIdMedia = item.querySelector("[data-media-id]").dataset.mediaId;
          if (!referenceItems.includes(dataIdMedia) && !reorderedItems.includes(item)) {
            item.dataset.index = reorderedItems.length;
            item.dataset.swiperSlideIndex = reorderedItems.length;
            reorderedItems.push(item);
          }
        });

        if (isSlider) {
          reorderedItems.forEach((item) => {
            if (isNav) {
              item.classList.toggle("swiper-slide-thumb-active", item.dataset.swiperSlideIndex === "0");
            } else {
              item.classList.toggle("swiper-slide-active", item.dataset.swiperSlideIndex === "0");
            }
          });
        }

        return reorderedItems;
      };

      const processItems = (currentItems, items) => {
        currentItems.forEach((slide) => {
          const dataIdMedia = slide.querySelector("[data-media-id]").dataset.mediaId;

          const isCurrentVariantMedia =
            this.currentVariantMedia &&
            this.currentVariantMedia.length > 0 &&
            this.currentVariantMedia.includes(dataIdMedia);
          const isNotImageType = !slide.classList.contains("media-type-image");

          if (
            isCurrentVariantMedia ||
            isNotImageType ||
            !this.currentVariantMedia ||
            this.currentVariantMedia.length === 0
          ) {
            items.push(slide);
          }
        });
      };

      if (this.variantGroupImages && this.variantGroupImages.enable) {
        if (this.media.mediaMode === "slider" && this.slides) {
          processItems(this.slides, mainItems);
          const reorderedMainItems = reorderItems(this.currentVariantMedia, mainItems, false, true);

          this.media.slider.removeAllSlides();
          this.media.slider.appendSlide(reorderedMainItems);
          this.media.slider.slideToLoop(this.layout === "layout-7" ? 1 : 0);
          this.media.handleSlideChange();

          if (this.slidesNav) {
            processItems(this.slidesNav, navItems);
            const reorderedNavItems = reorderItems(this.currentVariantMedia, navItems, true, true);
            if (this.media.navSlider) {
              this.media.navSlider.removeAllSlides();
              this.media.navSlider.appendSlide(reorderedNavItems);
              this.media.navSlider.slideToLoop(0);
            }
          }
        } else {
          const mediaWrapper = this.media.querySelector(".m-product-media--list");
          if (!mediaWrapper) return;

          processItems(this.mediaItems, mainItems);

          const reorderedItems = reorderItems(this.currentVariantMedia, mainItems);

          mediaWrapper.innerHTML = "";

          reorderedItems.forEach((item, index) => {
            if (this.layout === "layout-2") {
              item.classList.remove("m-col-span-2");
              if (index % 3 === 0) {
                item.classList.add("m-col-span-2");
              }
            }
            mediaWrapper.append(item);
          });
        }
      } else {
        let mediaSize = 0;

        if (this.media && "mediaSize" in this.media.dataset) {
          mediaSize = parseInt(this.media.dataset.mediaSize, 10);
        }

        if (mediaSize > 0) {
          this.media.setActiveMedia(this.currentVariant);
        }
      }

      this.removeLoading(this.media);
      this.handleImageZoom(mainItems, this.media);
    }

    updateBrowserHistory() {
      if (this.currentVariant && this.dataset.updateUrl !== "false") {
        window.history.replaceState({}, "", `${this.productUrl}?variant=${this.currentVariant.id}`);
      }
    }

    updateVariantInput() {
      document.querySelectorAll(`#product-form-${this.sectionId}, #product-form-installment`).forEach((productForm) => {
        const variantIdInput = productForm.querySelector(this.selectors.variantIdInput);
        if (variantIdInput) {
          variantIdInput.value = this.currentVariant.id;
          variantIdInput.dispatchEvent(new Event("input", { bubbles: true }));
        }
      });
    }

    updatePickupAvailability() {
      const pickUpAvailability = this.productWrapper.querySelector("pickup-availability");

      if (!pickUpAvailability) return;

      if (!this.currentVariant || !this.currentVariant.available) {
        pickUpAvailability.removeAttribute("available");
        pickUpAvailability.innerHTML = "";
        return;
      }

      pickUpAvailability.fetchAvailability(this.currentVariant.id);
    }

    removeErrorMessage() {
      const section = this.closest("section");
      if (!section) return;

      const productForm = section.querySelector("product-form");
      if (productForm) {
        productForm.handleErrorMessage();
      }
    }

    updatePrice() {
      const classes = {
        onSale: "m-price--on-sale",
        soldOut: "m-price--sold-out",
      };

      const selectors = {
        priceWrapper: ".m-price",
        salePrice: ".m-price-item--sale",
        compareAtPrice: [".m-price-item--regular"],
        unitPrice: ".m-price__unit",
        unitPriceWrapper: ".m-price__unit-wrapper",
        saleBadge: ".m-price__badge-sale",
        saleAmount: "[data-saved-price]",
      };

      const mainProductPrices = this.productWrapper.querySelector(".main-product__block-price");
      if (!mainProductPrices) return;

      const moneyFormat = window.MinimogSettings.money_format;
      const { priceWrapper, salePrice, unitPrice, compareAtPrice, saleBadge, saleAmount, unitPriceWrapper } =
        queryDomNodes(selectors, mainProductPrices);

      const { compare_at_price, price, unit_price_measurement, available } = this.currentVariant;
      const saleBadgeType = priceWrapper.dataset.saleBadgeType;

      const onSale = compare_at_price && compare_at_price > price;
      const soldOut = !available;

      priceWrapper.classList.toggle(classes.onSale, onSale);
      priceWrapper.classList.toggle(classes.soldOut, soldOut);
      priceWrapper.classList.remove("m:visibility-hidden");

      if (salePrice) {
        salePrice.innerHTML = formatMoney(price, moneyFormat);
      }

      if (compareAtPrice) {
        compareAtPrice.forEach(function (item) {
          const displayPrice = onSale ? compare_at_price : price;
          item.innerHTML = formatMoney(displayPrice, moneyFormat);
        });
      }

      if (saleBadge && onSale && saleBadgeType !== "text") {
        let value;
        if (saleBadgeType === "fixed_amount") {
          value = formatMoney(compare_at_price - price, moneyFormat);
        } else {
          const saving = Math.round(((compare_at_price - price) * 100) / compare_at_price) + "%";
          value = saving;
        }
        if (saleAmount) {
          saleAmount.innerHTML = value;
        }
      }

      if (unit_price_measurement && unitPrice) {
        unitPriceWrapper.classList.remove("m:hidden");
        const unitPriceContent =
          "<span>" +
          formatMoney(this.currentVariant.unit_price, moneyFormat) +
          "</span>/<span data-unit-price-base-unit>" +
          this._getBaseUnit() +
          "</span>";
        unitPrice.innerHTML = unitPriceContent;
      } else if (unitPriceWrapper) {
        unitPriceWrapper.classList.add("m:hidden");
      }
    }

    _getBaseUnit() {
      const { reference_value, reference_unit } = this.currentVariant.unit_price_measurement;
      return reference_value === 1 ? reference_unit : `${reference_value}${reference_unit}`;
    }

    updateButton(disable = true, text) {
      const productForms = document.querySelectorAll(`.product-form-${this.sectionId}`);
      if (!productForms.length) return;

      productForms.forEach((productForm) => {
        const addButton = productForm.querySelector('[name="add"]');
        if (!addButton) return;

        const dynamicCheckout = productForm.querySelector(".m-product-dynamic-checkout");
        const addButtonText = addButton.querySelector(".m-add-to-cart--text");

        const updateButtonState = (isDisabled) => {
          addButton.disabled = isDisabled;
          addButton.classList.toggle("disabled", isDisabled);
          if (dynamicCheckout) {
            dynamicCheckout.classList.toggle("disabled", isDisabled);
          }
          addButtonText.textContent = isDisabled && text ? text : window.MinimogStrings.addToCart;
        };

        updateButtonState(disable);
      });
    }

    updateProductMeta() {
      const { available, sku } = this.currentVariant;
      const { inStock, outOfStock } = window.MinimogStrings;
      const productAvailability = this.productWrapper.querySelector(this.selectors.productAvailability);
      const productSku = this.productWrapper.querySelector(this.selectors.productSku);

      if (productSku) {
        productSku.textContent = sku || "N/A";
      }

      if (productAvailability) {
        productAvailability.textContent = available ? inStock : outOfStock;
        productAvailability.classList.toggle("m-product-availability--outofstock", !available);
      }

      const metaUpdateEvent = new CustomEvent("product:meta-updated", {
        detail: { available, sku },
      });
      this.productWrapper.dispatchEvent(metaUpdateEvent);
    }

    updateVariantDescription() {
      const descriptionElement = this.productWrapper.querySelector(this.selectors.variantDescription);
      if (!descriptionElement) return;

      let description = "";
      if (this.currentVariant && this.currentVariant.metafields?.custom?.description_new?.value) {
        description = this.currentVariant.metafields.custom.description_new.value;
      }

      descriptionElement.textContent = description;
      descriptionElement.setAttribute("data-selected-value", description);
    }

    setUnavailable() {
      const button = document.getElementById(`product-form-${this.sectionId}`);
      if (!button) return;

      const addButton = button.querySelector('[name="add"]');
      if (!addButton) return;

      const addButtonText = addButton.querySelector(".m-add-to-cart--text");
      if (addButtonText) {
        addButtonText.textContent = window.MinimogStrings.unavailable;
      }

      const priceWrapper = this.productWrapper.querySelector(".m-price");
      if (priceWrapper) {
        priceWrapper.classList.add("m:visibility-hidden");
      }
    }

    hideSoldOutAndUnavailableOptions() {
      const classes = {
        soldOut: "m-product-option--node__soldout",
        unavailable: "m-product-option--node__unavailable",
      };
      const { optionNodes } = this.domNodes;
      const { variants, options } = this.productData;

      optionNodes.forEach((optNode) => {
        const { optionPosition, value } = optNode.dataset;
        const optPos = Number(optionPosition);
        const isSelectOption = optNode.tagName === "OPTION";

        let matchVariants = [];
        if (optPos === options.length) {
          const optionsArray = [...this.currentVariant.options];
          optionsArray[optPos - 1] = value;
          matchVariants.push(getVariantFromOptionArray(this.productData, optionsArray));
        } else {
          matchVariants = variants.filter(
            (v) =>
              v.options[optPos - 1] === value && v.options[optPos - 2] === this.currentVariant[`option${optPos - 1}`]
          );
        }

        matchVariants = matchVariants.filter(Boolean);
        const isSoldOut = matchVariants.length && matchVariants.every((v) => !v.available);
        const isUnavailable = !matchVariants.length;

        optNode.classList.toggle(classes.soldOut, isSoldOut);
        optNode.classList.toggle(classes.unavailable, isUnavailable);

        if (isSelectOption) {
          optNode.disabled = isUnavailable;
        }
      });
    }

    getVariantData() {
      if (this.variantData) {
        return this.variantData;
      }
      const productVariants = this.querySelector('#productVariants[type="application/json"]');
      if (productVariants) {
        try {
          this.variantData = JSON.parse(productVariants.textContent);
        } catch (error) {
          console.error("Error parsing variant data:", error);
        }
      }
      return this.variantData || {};
    }

    getVariantGroupImageData() {
      if (this.variantGroupImages) {
        return this.variantGroupImages;
      }
      const variantGroupElement = this.querySelector('#variantGroup[type="application/json"]');
      if (variantGroupElement) {
        try {
          this.variantGroupImages = JSON.parse(variantGroupElement.textContent);
        } catch (error) {
          console.error("Error parsing variant group images data:", error);
        }
      }
      return this.variantGroupImages || {};
    }

    initOptionSwatches() {
      const { _colorSwatches = [], _imageSwatches = [] } = window.MinimogSettings;

      if (!this.domNodes.optionNodes) return;

      this.domNodes.optionNodes.forEach((optNode) => {
        const { optionType, optionPosition, value: optionValue } = optNode.dataset;
        const optionValueLowerCase = optionValue && optionValue.toLowerCase();
        const variantToShowSwatchImage = this.variantData.find((v) => v[`option${optionPosition}`] === optionValue);
        const variantImage =
          variantToShowSwatchImage &&
          variantToShowSwatchImage.featured_image &&
          variantToShowSwatchImage.featured_image.src
            ? getSizedImageUrl(variantToShowSwatchImage.featured_image.src, "100x")
            : null;
        const customImage = _imageSwatches.find((i) => i.key === optionValueLowerCase);
        const customColor = _colorSwatches.find((c) => c.key === optionValueLowerCase);

        const labelElement = optNode.querySelector("label");
        if (!labelElement) return;

        if (variantImage || (customImage && customImage.value)) {
          labelElement.classList.add("has-bg-img");
        }

        labelElement.classList.remove("option-loading");

        switch (optionType) {
          case "default":
          case "image":
            labelElement.style.backgroundImage = `url(${(customImage && customImage.value) || variantImage || ""})`;
            break;
          case "color":
            labelElement.style.backgroundColor = (customColor && customColor.value) || optionValueLowerCase;
            if (customImage && customImage.value) {
              labelElement.style.backgroundImage = `url(${customImage.value})`;
            }
            break;
          default:
            break;
        }
      });
    }
  }

  customElements.define("variant-picker", VariantPicker);
}

if (!customElements.get("variant-button")) {
  class VariantButton extends HTMLElement {
    constructor() {
      super();
      this.selectedSpan = this.querySelector(".option-label--selected");
      this.addEventListener("change", this.updateSelectedValue);
    }

    updateSelectedValue() {
      this.value = Array.from(this.querySelectorAll("input")).find((radio) => radio.checked).value;
      this.setAttribute("data-selected-value", this.value);
      if (this.selectedSpan) {
        this.selectedSpan.textContent = this.value;
        this.selectedSpan.classList.remove("m:text-color-error");
      }
    }
  }

  customElements.define("variant-button", VariantButton);

  if (!customElements.get("variant-select")) {
    class VariantSelect extends VariantButton {
      constructor() {
        super();
      }

      updateSelectedValue() {
        this.value = this.querySelector("select").value;
        this.setAttribute("data-selected-value", this.value);
        if (this.selectedSpan) {
          this.selectedSpan.textContent = this.value;
          this.selectedSpan.classList.remove("m:text-color-error");
        }
      }
    }

    customElements.define("variant-select", VariantSelect);
  }

  if (!customElements.get("variant-image")) {
    class VariantImage extends VariantButton {
      constructor() {
        super();
      }
    }

    customElements.define("variant-image", VariantImage);
  }

  if (!customElements.get("variant-color")) {
    class VariantColor extends VariantButton {
      constructor() {
        super();
      }
    }
    customElements.define("variant-color", VariantColor);
  }
}