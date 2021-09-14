// @flow
import type { RequestType } from "../types";

const tracing = require("mshell-node-tracing");
const axios = require("axios");
const { OPS } = require("common/constants/configServiceKeys");
const { getRumSetupHtml } = require("@skyscanner-internal/mshell-node-rum");

const envConfig = require("../../envConfig");
const getTranslations = require("../../utils/getTranslations");
const { getUrl } = require("../../services/ums");
const { getSeoContent } = require("../../services/contentService");
const { TRANSLATION_KEYS, PAGE_TYPE_HOME } = require("../../constants");
const {
  getPageTypeForPath,
  isPageTypeForSEO,
} = require("../../utils/pageType");
const ConfigModel = require("../../services/configService/ConfigModel");
const getHrefLangHtml = require("../../services/hrefLangTags");
const { getAdvert } = require("../../services/deliveryService");

const getCanonicalUrl = async (locale, market, pageType): Promise<?string> => {
  const urlInfo = await getUrl({ market, locale, pageType });
  if (urlInfo) {
    return urlInfo.urlNoCulture;
  }
  return undefined;
};

type GetViewContextReturnVal = { [string]: mixed };

const getViewContext = async (
  culture: {
    isRightToLeft: boolean;
    locale: string;
    market: string;
    currency: string;
  },
  req: RequestType,
  tc: typeof tracing,
  configServiceModel: ConfigModel
): GetViewContextReturnVal => {
  const { isRightToLeft, locale, market, currency } = culture;
  const pageType = getPageTypeForPath(req.path);

  let canonicalUrl;
  let hrefLangTags;
  if (isPageTypeForSEO(pageType)) {
    canonicalUrl = await getCanonicalUrl(locale, market, pageType);
    hrefLangTags = await getHrefLangHtml(pageType, tc);
  }

  const { title, metaDescription } = await getSeoContent({
    locale,
    market,
    pageType: isPageTypeForSEO(pageType) ? pageType : PAGE_TYPE_HOME,
  });

  const res =
    envConfig.env === "development"
      ? await axios.get(envConfig.indexContentPath)
      : {};
  const translations = getTranslations(locale);

  let advert = null;
  let advertImageUrl = null;
  if (
    pageType === PAGE_TYPE_HOME &&
    configServiceModel.getBooleanValue(OPS.ENABLE_PRELOADED_ADVERT)
  ) {
    const advertData = await tc.tracePromise(
      "getAdvert",
      getAdvert({
        locale,
        market,
        currency,
        cookieString: req.headers.cookie,
        timeout: configServiceModel.getIntValue(
          OPS.DELIVERY_SERVICE_BACKEND_TIMEOUT
        ),
        sponsoredPreviewId: req.query.sponsoredPreviewId,
      })
    );
    advert = advertData.advert;
    advertImageUrl = advertData.advertImageUrl;
  }

  return {
    indexContent: res.data,
    canonicalUrl,
    description: metaDescription || translations[TRANSLATION_KEYS.DESCRIPTION],
    dir: isRightToLeft ? "rtl" : "ltr",
    hrefLangTags,
    lang: locale,
    polyfillHtml: req.polyfill.script,
    rumSetupHtml: getRumSetupHtml("banana", pageType),
    title: title || translations[TRANSLATION_KEYS.TITLE],
    advert: JSON.stringify(advert),
    advertImageUrl,
  };
};

module.exports = getViewContext;
