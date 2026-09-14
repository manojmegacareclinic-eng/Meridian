process.env.DATABASE_URL = "postgresql://localhost:5432/meridian";
process.env.BETTER_AUTH_SECRET = "test-secret-12345678901234567890123456789012";
import app from "@workspace/api-server/src/app";

console.log("App routes:");
app._router?.stack?.forEach((layer: any) => {
  if (layer.route) {
    console.log(`${Object.keys(layer.route.methods).join(",")} ${layer.route.path}`);
  } else if (layer.name === "router") {
    layer.handle.stack?.forEach((subLayer: any) => {
      if (subLayer.route) {
        console.log(`${Object.keys(subLayer.route.methods).join(",")} ${subLayer.route.path}`);
      }
    });
  }
});
