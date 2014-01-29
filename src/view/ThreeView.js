"use strict";
/* jslint browser: true, globalstrict: true, devel: true, debug: true */
/* global THREE, THREEx, signals, Stats, Detector */
/* global check, checkDefined, EC_Placeable, EC_Mesh, EC_Camera, EC_Light,
   LT_Point, LT_Spot, LT_Directional */

// For conditions of distribution and use, see copyright notice in LICENSE
/*
 *      @author Erno Kuusela
 *      @author Tapani Jamsa
 */

var useCubes = false;
var parentCameraToScene = true;
var debugFloat = 0;

function ThreeView(scene) {
    this.o3dByEntityId = {}; // Three.Object3d's that correspond to Placeables and have Meshes etc as children

    // SCENE
    this.scene = scene;

    // Default camera
    var SCREEN_WIDTH = window.innerWidth,
        SCREEN_HEIGHT = window.innerHeight;
    var VIEW_ANGLE = 45,
        ASPECT = SCREEN_WIDTH / SCREEN_HEIGHT,
        NEAR = 0.1,
        FAR = 20000;
    this.camera = new THREE.PerspectiveCamera(VIEW_ANGLE, ASPECT, NEAR, FAR);
    this.scene.add(this.camera);
    this.camera.position.set(0, 0, 0);
    this.camera.lookAt(this.scene.position);

    // STATS
    this.stats = new Stats();
    this.stats.domElement.style.position = 'absolute';
    this.stats.domElement.style.bottom = '0px';
    this.stats.domElement.style.zIndex = 100;

    // RENDERER    
    if (Detector.webgl)
        this.renderer = new THREE.WebGLRenderer({
            antialias: true
        });
    else
        this.renderer = new THREE.CanvasRenderer();
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    // EVENTS
    THREEx.WindowResize(this.renderer, this.camera);
    THREEx.FullScreen.bindKey({
        charCode: 'm'.charCodeAt(0)
    });

    // CONTAINER
    this.container = document.getElementById('ThreeJS');
    this.container.appendChild(this.stats.domElement);
    this.container.appendChild(this.renderer.domElement);
    document.body.appendChild(this.container);

    // LIGHT, GEOMETRY AND MATERIAL
    this.cubeGeometry = new THREE.CubeGeometry(2, 2, 2);
    this.wireframeMaterial = new THREE.MeshBasicMaterial({
        color: 0x00ee00,
        wireframe: true,
        transparent: true
    });

    // PROJECTOR
    this.projector = new THREE.Projector();

    // MOUSE EVENTS
    this.objectClicked = new signals.Signal();
    document.addEventListener('mousedown', this.onMouseDown.bind(this), false);

    // INTERPOLATION
    this.interpolations = [];
    this.updatePeriod_ = 1 / 20; // seconds
    this.avgUpdateInterval = 0;
    this.clock = new THREE.Clock();
    this.debugClock = new THREE.Clock();
    // debug
    this.debug = false;

    // Hack for Physics2 scene
    this.pointLight = new THREE.PointLight(0xffffff);
    this.pointLight.position.set(-100, 200, 100);
    this.scene.add(this.pointLight);

    this.meshReadySig = new signals.Signal();
    this.assetLoader = new ThreeAssetLoader();
}

ThreeView.prototype = {

    constructor: ThreeView,

    render: function(delta) {
        // checkDefined(this.scene, this.camera);

        // Update interpolations

        // AttributeInterpolation& interp = interpolations_[i];
        // for(size_t i = interpolations_.size() - 1; i < interpolations_.size(); --i)
        // interp.dest.Get()->Interpolate(interp.start.Get(), interp.end.Get(), t, AttributeChange::LocalOnly);
        // ...
        // newTrans.scale = Lerp(startValue.scale, endValue.scale, t);
        // Set(newTrans, change);
        if (this.debug && this.debugClock.getElapsedTime() < 3 && this.interpolations.length > 0) {
            console.log("===RENDER=======================");
        }

        for (var i = this.interpolations.length - 1; i >= 0; i--) {
            var interp = this.interpolations[i];
            var finished = false;

            // Check that the component still exists i.e. it's safe to access the attribute
            if (interp.dest) {
                if (this.debug && this.debugClock.getElapsedTime() < 3) {
                    console.log("interp.time: " + interp.time);
                    console.log("interp.length: " + interp.length);
                    console.log("lerpAlpha: " + (interp.time / interp.length));
                    console.log("delta: " + delta);
                }

                // Allow the interpolation to persist for 2x time, though we are no longer setting the value
                // This is for the continuous/discontinuous update detection in StartAttributeInterpolation()
                if (interp.time <= interp.length) {
                    interp.time += delta;
                    var t = interp.time / interp.length; // between 0 and 1

                    if (this.debug && this.debugClock.getElapsedTime() < 3) {
                        debugFloat = t;
                        console.log("interp.time: " + interp.time);
                        console.log("interp.length: " + interp.length);
                        console.log("lerpAlpha: " + (interp.time / interp.length));
                    }
                    if (t > 1) {
                        t = 1;
                    }

                    // Interpolate
                    var newPos = interp.start.clone();
                    newPos.lerp(interp.end, t);
                    interp.dest.position = newPos;

                    // DEBUG

                    // console.clear();
                    if (this.debug && this.debugClock.getElapsedTime() < 3) {
                        console.log("-------------");
                        console.log("i: " + i);
                        console.log("time: " + t);
                        console.log("interp.start: " + interp.start);
                        console.log("interp.end: " + interp.end);
                        console.log("newPos: " + newPos);
                        console.log("-------------");
                    }

                } else {
                    interp.time += delta;
                    if (interp.time >= interp.length * 2)
                        finished = true;
                }
            } else {
                // Component pointer has expired, abort this interpolation
                console.log("Component pointer has expired, abort this interpolation");
                finished = true;
            }

            // Remove interpolation (& delete start/endpoints) when done
            if (finished) {
                if (this.debug && this.debugClock.getElapsedTime() < 3) {
                    console.log("Remove interpolation");
                }
                this.interpolations.splice(i, 1);
            }
        }

        if (this.debug && this.debugClock.getElapsedTime() < 3 && this.interpolations.length > 0) {
            console.log("================================");
        }


        this.renderer.render(this.scene, this.camera);
    },

    onComponentAddedOrChanged: function(entity, component) {
        // try {
        return this.onComponentAddedOrChangedInternal(entity, component);
        // } catch (e) {
        //     debugger;
        // }
    },
    onComponentAddedOrChangedInternal: function(entity, component, changeType, changedAttr) {
        check(component instanceof Component);
        check(entity instanceof Entity);
        var threeGroup = this.o3dByEntityId[entity.id];
        var isNewEntity = false;
        if (!threeGroup) {
            check(entity.id > 0);
            this.o3dByEntityId[entity.id] = threeGroup = new THREE.Object3D();
            //console.log("created new o3d group id=" + threeGroup.id);
            isNewEntity = true;
            threeGroup.userData.entityId = entity.id;
            //console.log("registered o3d for entity", entity.id);
        } else {
            //console.log("got cached o3d group " + threeGroup.id + " for entity " + entity.id);
        }

        if (component instanceof EC_Placeable)
            this.connectToPlaceable(threeGroup, component);
        else if (component instanceof EC_Mesh) {
            // console.log("mesh changed or added for o3d " + threeGroup.userData.entityId);
            this.onMeshAddedOrChanged(threeGroup, component);
        } else if (component instanceof EC_Camera)
            this.onCameraAddedOrChanged(threeGroup, component);
        else if (component instanceof EC_Light)
            this.onLightAddedOrChanged(threeGroup, component);
        else
            console.log("Component not handled by ThreeView:", entity, component);
    },

    onComponentRemoved: function(entity, component, changeType) {
        try {
            return this.onComponentRemovedInternal(entity, component);
        } catch (e) {
            debugger;
        }
    },

    onComponentRemovedInternal: function(entity, component) {
        checkDefined(component, entity);

        if (component instanceof EC_Placeable) {
            var threeGroup = this.o3dByEntityId[entity.id];
            threeGroup.parent.remove(threeGroup);
            delete this.o3dByEntityId[entity.id];
        } else if (component instanceof EC_Mesh) {
            //console.log("mesh added for o3d", threeGroup.userData.entityId);
            // this.onMeshAddedOrChanged(threeGroup, component);
        } else if (component instanceof EC_Camera) {
            // this.onCameraAddedOrChanged(threeGroup, component);
        } else if (component instanceof EC_Light) {
            // this.onLightAddedOrChanged(threeGroup, component);
        } else
            console.log("view doesn't know about removed component " + component);
    },

    onMeshAddedOrChanged: function(threeGroup, meshComp) {
        if (meshComp.threeMesh) {
            /* remove previous mesh if it existed */
            /* async hazard: what if two changes for same mesh come in
               order A, B and loads finish in order B, A */
            threeGroup.remove(meshComp.threeMesh);
            //console.log("removing prev three mesh on ec_mesh attr change", changedAttr);
        } else {
            //console.log("adding first mesh for o3d id=" + threeGroup.id);
        }

        var url = meshComp.meshRef.ref;

        url = url.replace(/\.mesh$/i, ".json");

        var thisIsThis = this;
        this.assetLoader.cachedLoadAsset(url, function(geometry, material) {
            thisIsThis.onMeshLoaded(threeGroup, meshComp, geometry, material);
        });

        var onMeshAttributeChanged = function(changedAttr, changeType) {
            if (changedAttr.id != "meshRef")
                return;
            //console.log("onMeshAddedOrChanged due to attributeChanged ->", changedAttr.ref);
            thisIsThis.onMeshAddedOrChanged(threeGroup, meshComp);
        };
        meshComp.attributeChanged.remove(onMeshAttributeChanged);
        meshComp.attributeChanged.add(onMeshAttributeChanged);
    },

    onMeshLoaded: function(threeParent, meshComp, geometry, material) {
        if (geometry === undefined) {
            console.log("mesh load failed");
            return;
        }
        checkDefined(geometry, material, meshComp, threeParent);
        checkDefined(meshComp.parentEntity);
        check(threeParent.userData.entityId === meshComp.parentEntity.id);
        // console.log("Mesh loaded:", meshComp.meshRef.ref, "- adding to o3d of entity "+ threeParent.userData.entityId);
        checkDefined(threeParent, meshComp, geometry, material);
        var mesh;
        if (useCubes)
            mesh = new THREE.Mesh(this.cubeGeometry, this.wireframeMaterial);
        else
            mesh = new THREE.Mesh(geometry, new THREE.MeshFaceMaterial(material));
        meshComp.threeMesh = mesh;
        //mesh.applyMatrix(threeParent.matrixWorld);
        threeParent.add(mesh);
        this.meshReadySig.dispatch(meshComp, mesh);
        mesh.needsUpdate = 1;
        console.log("added mesh to o3d id=" + threeParent.id);
        check(threeParent.children.length == 1);
        // threeParent.needsUpdate = 1;

        // do we need to set up signal that does
        // mesh.applyMatrix(threeParent.matrixWorld) when placeable
        // changes?
    },

    onLightAddedOrChanged: function(threeGroup, lightComp) {
        var prevThreeLight = lightComp.threeLight;
        if (prevThreeLight) {
            // console.log("removed existing light");
            threeGroup.remove(prevThreeLight);
        }
        if (lightComp.type != LT_Point) {
            console.log("not implemented: light type " + lightComp.type);
            return;
        }
        var threeColor = THREE.Color();
        /* for story about diffuse color and Three, see
           https://github.com/mrdoob/three.js/issues/1595 */
        lightComp.threeLight = new THREE.PointLight(threeColor,
            lightComp.brightness,
            lightComp.range);
        threeGroup.add(lightComp.threeLight);
        var thisIsThis = this;
        var onLightAttributeChanged = function(changedAttr, changeType) {
            //console.log("onLightAddedOrChanged due to attributeChanged ->", changedAttr.ref);
            var id = changedAttr.id;
            if (id === "range" || id === "brightness" ||
                id === "diffuseColor" || id === "type")
                thisIsThis.onLightAddedOrChanged(threeGroup, lightComp);
        };
        lightComp.attributeChanged.remove(onLightAttributeChanged);
        lightComp.attributeChanged.add(onLightAttributeChanged);
    },

    onCameraAddedOrChanged: function(threeGroup, cameraComp) {
        var prevThreeCamera = cameraComp.threeCamera;
        if (prevThreeCamera) {
            threeGroup.remove(prevThreeCamera);
            console.log("removing previous camera");
        }
        console.log("make camera");
        var threeAspectRatio = cameraComp.aspectRatio;
        if (threeAspectRatio === "")
            threeAspectRatio = 1.0;
        var px = cameraComp.parentEntity.placeable.transform;
        checkDefined(px);
        //console.log("camera rot from placeable x=" + px.rot.x);
        cameraComp.threeCamera = new THREE.PerspectiveCamera(
            cameraComp.verticalFov, threeAspectRatio,
            cameraComp.nearPlane, cameraComp.farPlane);
        copyXyz(px.rot, cameraComp.threeCamera.rotation);
        copyXyz(px.pos, cameraComp.threeCamera.position);
        this.camera = cameraComp.threeCamera;
        //console.log("switched main camera to this one (o3d id" + cameraComp.threeCamera.id + ")");
        //console.log("copied camera pos/rot from placeable");
        if (parentCameraToScene)
            this.scene.add(cameraComp.threeCamera);
        else
            threeGroup.add(cameraComp.threeCamera);
        //console.log("camera own pos: " + cameraComp.threeCamera.position);
        //console.log("camera group pos: " + threeGroup.position);
        var thisIsThis = this;
        var onCameraAttributeChanged = function(changedAttr, changeType) {
            //console.log("onCameraAddedOrChanged due to attributeChanged ->", changedAttr.ref);
            var id = changedAttr.id;
            if (id === "aspectRatio" || id === "verticalFov" ||
                id === "nearPlane" || id === "farPlane")
                thisIsThis.onCameraAddedOrChanged(threeGroup, cameraComp);
        };
        var removed = cameraComp.attributeChanged.remove(onCameraAttributeChanged);
        if (removed) {
            //console.log("removed old camera attr change hook");
        }
        cameraComp.attributeChanged.add(onCameraAttributeChanged);

        this.connectToPlaceable(cameraComp.threeCamera, cameraComp.parentEntity.placeable);
        console.log("camera (o3d id " + cameraComp.threeCamera.id + ", entity id" + cameraComp.parentEntity.id + ") connected to placeable");

        // var onCameraAttributeChanged = function(changedAttr, changeType) {
        //     //console.log("onCameraAddedOrChanged due to attributeChanged ->", changedAttr.ref);
        //     var id = changedAttr.id;
        //     if (id === "aspectRatio" || id === "verticalFov" ||
        //         id === "nearPlane" || id === "farPlane")
        //         thisIsThis.onCameraAddedOrChanged(threeGroup, cameraComp);
        // };
        // var removed = cameraComp.attributeChanged.remove(onCameraAttributeChanged);
        // if (removed)
        //     console.log("removed old camera attr change hook");
        // cameraComp.attributeChanged.add(onCameraAttributeChanged);

    },

    degToRad: function(val) {
        return val * (Math.PI / 180);
    },

    updateFromTransform: function(threeMesh, placeable) {
        if (threeMesh.id === 7) {
            checkDefined(placeable, threeMesh);
            var ptv = placeable.transform;

            // INTERPOLATION

            if (this.debug && this.debugClock.getElapsedTime() < 3) {
                console.log("...updateFromTransform.....");
                console.log(ptv);

            }

            // Update interval

            // void UpdateReceived()
            // {
            //     float time = updateTimer.MSecsElapsed() * 0.001f;
            //     updateTimer.Start();
            //     // Maximum update rate should be 100fps. Discard either very frequent or very infrequent updates.
            //     if (time < 0.005f || time >= 0.5f)
            //         return;
            //     // If it's the first measurement, set time directly. Else smooth
            //     if (avgUpdateInterval == 0.0f)
            //         avgUpdateInterval = time;
            //     else
            //         avgUpdateInterval = 0.5 * time + 0.5 * avgUpdateInterval;
            // }

            // If it's the first measurement, set time directly. Else smooth
            var time = this.clock.getDelta(); // seconds

            if (this.avgUpdateInterval === 0) {
                this.avgUpdateInterval = time;
            } else {
                this.avgUpdateInterval = 0.5 * time + 0.5 * this.avgUpdateInterval;
            }
            if (this.debug && this.debugClock.getElapsedTime() < 3) {
                console.log("time: " + time);
                console.log("this.avgUpdateInterval: " + this.avgUpdateInterval);
                console.log("...........................");
            }

            //-----------------

            // // Record the update time for calculating the update interval
            // float updateInterval = updatePeriod_; // Default update interval if state not found or interval not measured yet
            // std::map<entity_id_t, EntitySyncState>::iterator it = state->entities.find(entityID);
            // if (it != state->entities.end())
            // {
            //     it->second.UpdateReceived();
            //     if (it->second.avgUpdateInterval > 0.0f)
            //         updateInterval = it->second.avgUpdateInterval;
            // }
            // // Add a fudge factor in case there is jitter in packet receipt or the server is too taxed
            // updateInterval *= 1.25f;


            var updateInterval = this.updatePeriod_;
            if (this.avgUpdateInterval > 0) {
                updateInterval = this.avgUpdateInterval;
            }
            // Add a fudge factor in case there is jitter in packet receipt or the server is too taxed
            updateInterval *= 1.25;



            // End previous interpolation if existed

            for (var i = this.interpolations.length - 1; i >= 0; i--) {
                // TODO  if (interp.dest.Get() == attr)
                if (this.debug && this.debugClock.getElapsedTime() < 3) {
                    console.log("Remove previous interpolation");
                }
                this.interpolations.splice(i, 1);
            }



            // Create new interpolation

            var endAttr = new THREE.Vector3();
            copyXyz(ptv.pos, endAttr);

            var newInterp = {
                dest: threeMesh,
                start: threeMesh.position, // attr
                end: endAttr, // end attr
                time: 0,
                length: updateInterval // update interval (seconds)
            };

            this.interpolations.push(newInterp);



            // THREE MESH

            // copyXyz(ptv.pos, threeMesh.position);
            copyXyz(ptv.scale, threeMesh.scale);
            copyXyzMapped(ptv.rot, threeMesh.rotation, this.degToRad);
            if (placeable.debug)
                console.log("update placeable to " + placeable);
            threeMesh.needsUpdate = true; // is this needed?
        }
    },

    connectToPlaceable: function(threeObject, placeable) {
        this.updateFromTransform(threeObject, placeable);
        if (placeable.debug)
            console.log("connect o3d " + threeObject.id + " to placeable - pl x " + placeable.transform.pos.x + " o3d x " + threeObject.position.x + " o3d parent x " + threeObject.parent.position.x);

        //NOTE: this depends on component handling being done here before the componentReady signal fires
        var thisIsThis = this;
        placeable.parentRefReady.add(function() {
            var parent = thisIsThis.parentForPlaceable(placeable);
            //NOTE: assumes first call -- add removing from prev parent to support live changes! XXX
            parent.add(threeObject);
            if (placeable.debug)
                console.log("parent ref set - o3d id=" + threeObject.id + " added to parent " + parent.id);
            thisIsThis.updateFromTransform(threeObject, placeable);
            placeable.attributeChanged.add(function(attr, changeType) {
                thisIsThis.updateFromTransform(threeObject, placeable); //Todo: pass attr to know when parentRef changed
            });
        });
    },

    parentForPlaceable: function(placeable) {
        var parent;
        if (placeable.parentRef) {
            var parentOb = this.o3dByEntityId[placeable.parentRef];
            if (!parentOb) {
                console.log("ThreeView parentForPlaceable ERROR: adding object but parent not there yet -- even though this is called only after the parent was reported being there in the EC scene data. Falling back to add to scene.");
                parent = this.scene;
            } else {
                parent = parentOb;
            }
        } else {
            parent = this.scene;
        }

        return parent;
    },

    onMouseDown: function() {
        var camera = this.camera;
        var mouse = {
            x: (event.clientX / window.innerWidth) * 2 - 1,
            y: -(event.clientY / window.innerHeight) * 2 + 1,
        };

        // Raycast
        var vector = new THREE.Vector3(mouse.x, mouse.y, 1);
        this.projector.unprojectVector(vector, camera);
        var pLocal = new THREE.Vector3(0, 0, -1);
        var pWorld = pLocal.applyMatrix4(camera.matrixWorld);
        var ray = new THREE.Raycaster(pWorld, vector.sub(pWorld).normalize());

        // Get meshes from all objects
        var getMeshes = function(children) {
            var meshes = [];
            for (var i = 0; i < children.length; i++) {
                if (children[i].children.length > 0) {
                    meshes = meshes.concat(getMeshes(children[i].children));
                } else if (children[i] instanceof THREE.Mesh) {
                    meshes.push(children[i]);
                }
            }
            return meshes;
        };
        var objects = attributeValues(this.o3dByEntityId);
        var meshes = getMeshes(objects);

        // Intersect
        var intersects = ray.intersectObjects(meshes);

        // if there is one (or more) intersections
        if (intersects.length > 0) {
            var clickedObject = intersects[0].object;
            var entID = clickedObject.parent.userData.entityId;
            var intersectionPoint = "" + intersects[0].point.x + "," + intersects[0].point.y + "," + intersects[0].point.z;

            var params = [event.button, intersectionPoint, intersects[0].face.materialIndex];

            this.objectClicked.dispatch(entID, params);
        }
    }
};

EC_Placeable.prototype.toString = function() {
    var t = this.transform;
    return "[Placeable pos:" + t.pos.x + " " + t.pos.y + " " + t.pos.z + ", rot:" + t.rot.x + " " + t.rot.y + " " + t.rot.z + ", scale:" + t.scale.x + " " + t.scale.y + " " + t.scale.z + "]";
};

THREE.Vector3.prototype.toString = function() {
    return "[THREE.Vector3 " + this.x + " " + this.y + " " + this.z + "]";
};
THREE.Euler.prototype.toString = function() {
    return "[THREE.Euler " + this.x + " " + this.y + " " + this.z + "]";
};

function copyXyz(src, dst) {
    dst.x = src.x;
    dst.y = src.y;
    dst.z = src.z;
}

function copyXyzMapped(src, dst, mapfun) {
    dst.x = mapfun(src.x);
    dst.y = mapfun(src.y);
    dst.z = mapfun(src.z);
}

function ThreeAssetLoader() {
    this.pendingLoads = {};
}

ThreeAssetLoader.prototype.cachedLoadAsset = function(url, loadedCallback) {
    var loadedSig = this.pendingLoads[url];
    if (loadedSig === undefined) {
        loadedSig = new signals.Signal();
        loadedSig.addOnce(loadedCallback);
        this.pendingLoads[url] = loadedSig;
    } else {
        loadedSig.addOnce(loadedCallback);
    }

    check(typeof(url) === "string");
    if (url === "") {
        loadedCallback();
        return;
    }

    var thisIsThis = this;
    this.load(url, function(geometry, material) {
        if (material === undefined) {
            material = new THREE.MeshBasicMaterial({
                color: 0x808080
            });
        }
        checkDefined(geometry);
        loadedCallback(geometry, material);
        delete thisIsThis.pendingLoads[url];
    }, {});
};

ThreeAssetLoader.prototype.load = function(url, completedCallback) {
    check(typeof url === "string");
    if (url === "") {
        completedCallback();
        return;
    }
    var fn;
    if (suffixMatch(url, ".ctm"))
        fn = this.loadCtm;
    else if (suffixMatch(url, ".json") || suffixMatch(url, ".js"))
        fn = this.loadJson;
    else
        throw "don't know url suffix " + url;

    fn(url, completedCallback);
};

ThreeAssetLoader.prototype.loadCtm = function(url, completedCallback) {
    var loader = new THREE.CTMLoader();
    loader.load(url, completedCallback, {
        useWorker: false
    });
};

ThreeAssetLoader.prototype.loadJson = function(url, completedCallback) {
    var loader = new THREE.JSONLoader();
    loader.load(url, completedCallback);
};


function suffixMatch(str, suffix) {
    str = str.toLowerCase();
    suffix = suffix.toLowerCase();
    return str.indexOf(suffix, str.length - suffix.length) !== -1;
}
