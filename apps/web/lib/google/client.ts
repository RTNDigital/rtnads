import { GoogleAdsApi } from "google-ads-api";

let cachedApi: GoogleAdsApi | null = null;

function getApi(): GoogleAdsApi {
  if (cachedApi) return cachedApi;

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const developerToken = process.env.GOOGLE_DEVELOPER_TOKEN;

  if (!clientId || !clientSecret || !developerToken) {
    throw new Error("Google Ads API credentials not configured");
  }

  cachedApi = new GoogleAdsApi({
    client_id: clientId,
    client_secret: clientSecret,
    developer_token: developerToken,
  });

  return cachedApi;
}

export async function listAccessibleCustomers(refreshToken: string) {
  const api = getApi();
  return api.listAccessibleCustomers(refreshToken);
}

export function getGoogleAdsClient(
  refreshToken: string,
  loginCustomerId?: string,
) {
  const api = getApi();
  return api.Customer({
    customer_id: "",
    refresh_token: refreshToken,
    login_customer_id: loginCustomerId,
  });
}

export function getCustomerClient(
  customerId: string,
  refreshToken: string,
  loginCustomerId?: string,
) {
  const api = getApi();
  return api.Customer({
    customer_id: customerId,
    refresh_token: refreshToken,
    login_customer_id: loginCustomerId,
  });
}
