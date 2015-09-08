
require.config({
    // Module name
    name    : "main",
    
    // Base for all RequireJS paths
    baseUrl : "../../src",

    /** Shims for dependency load order. Eg. jquery-ui depends jquery to be loaded so it can attach itself.
        'exports' is a way to note what the module will export to the global window object. */
    shim    :
    {
        "lib/jquery"                    : { exports : "$" },
        "lib/jquery-ui"                 : [ "lib/jquery" ],
        "lib/jquery.mousewheel"         : [ "lib/jquery" ],
        "lib/jquery.titlealert.min"     : [ "lib/jquery" ],
        "lib/jquery.jgestures"          : [ "lib/jquery" ],
        "lib/jquery.contextmenu"        : [ "lib/jquery" ],
        "lib/three"                     : { exports : "THREE" },
        "lib/three/CSS3DRenderer"       : [ "lib/three" ],
        "lib/three/OBJLoader"           : [ "lib/three" ],
        "lib/polymer.min"               : { exports : "Polymer" },
        "lib/ammo"                      : { exports : "Ammo" }
    }
});

require([
        // Core deps
        "lib/three",
        "lib/jquery",
        "lib/jquery-ui",
        "lib/jquery.mousewheel",                /// @todo Remove as core dependency (afaik UiAPI)
        "lib/jquery.titlealert.min",            /// @todo Remove as core dependency (afaik UiAPI)
        // Client
        "core/framework/TundraClient",
        "core/scene/EntityAction",
        // Renderer
        "view/threejs/ThreeJsRenderer",
        // Plugins
        "plugins/login-screen/LoginScreenPlugin",
        "plugins/asset-redirect/AssetRedirectPlugin"
    ],
    function(THREE, $, _jqueryUI, _jqueryMW, _jqueryTA,
             Client,
             EntityAction,
             ThreeJsRenderer,
             LoginScreenPlugin)
{
    // Setup loading screen
    LoginScreenPlugin.LoadingScreenHeaderText = "WebTundra Physics2 Example";
    LoginScreenPlugin.LoadingScreenHeaderLinkUrl = "https://github.com/realXtend/tundra/tree/tundra2/bin/scenes/Physics2";

    // Create client
    var client = new Client({
        container     : "#webtundra-container-custom",
        renderSystem  : ThreeJsRenderer
    });

    // Configure asset redirects.
    var redirectPlugin = TundraSDK.plugin("AssetRedirectPlugin");
    redirectPlugin.registerAssetTypeSwap(".mesh", ".json", "ThreeJsonMesh");
    redirectPlugin.setupDefaultStorage();

    // App variables
    var freecamera = null;
    var instructions = null;

    // Start freecam app
    $.getScript("../../src/application/freecamera.js")
        .done(function( script, textStatus ) {
            freecamera = new FreeCameraApplication();
        })
        .fail(function(jqxhr, settings, exception) {
            console.error("Failed to load FreeCamera application:", exception);
        }
    );

    // Connected to server
    client.onConnected(null, function() {
        // Setup initial camera position
        if (freecamera && freecamera.cameraEntity)
            freecamera.cameraEntity.placeable.setPosition(0, 8.50, 28.50);

        instructions = $("<div/>", { 
            text : "Click on the top sphere to start the physics simulation",
            css : {
                "position": "absolute",
                "width": 360,
                "background-color": "white",
                "top": 10,
                "left": 10,
                "padding": 10,
                "border-radius": 10,
                "text-align": "center"
            }
        });
        client.ui.addWidgetToScene(instructions);
        instructions.hide();
        instructions.fadeIn(5000);

        var dirLight = new THREE.DirectionalLight();
        client.renderer.scene.add(dirLight);
    });

    // Disconnected from server
    client.onDisconnected(null, function() {
        if (instructions)
            instructions.remove()
        instructions = null;
    });

    // Mouse pressed
    client.input.onMousePress(null, function(mouse) {
        if (!mouse.leftDown)
            return;

        var result = client.renderer.raycast();
        if (result.entity != null && result.entity.name === "Boulder")
        {
            result.entity.exec(EntityAction.Server, "MousePress");
            if (instructions)
            {
                instructions.text("Good job!");
                instructions.fadeOut(5000, function() {
                    instructions.remove();
                    instructions = null;
                });
            }
        }
    });
});
